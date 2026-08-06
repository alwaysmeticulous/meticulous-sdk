import { readFile } from "fs/promises";
import type { SessionFilter } from "@alwaysmeticulous/api";
import type { RequestedProjectAssetChunkReference } from "@alwaysmeticulous/client";
import {
  createClientWithOAuth,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import { runWithUploadedAssetChunks } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { parseRewrites } from "../../command-utils/parse-rewrites";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import {
  hasGitContextForTestRunWait,
  resolveGitOptions,
} from "./resolve-git-options";
import {
  manifestHasVersionLookupEntries,
  validateAssetReferencesManifest,
} from "./run-with-uploaded-asset-chunks.utils";
import { readSessionFilterFile } from "./session-filter.utils";

const POLL_INTERVAL_MS = 10_000;

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;
  assetReferencesManifest: string;
  rewrites?: string;
  sessionFilter?: string | undefined;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
}

const readAssetReferencesManifest = async (
  manifestPath: string,
): Promise<RequestedProjectAssetChunkReference[]> => {
  const logger = initLogger();
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch (error) {
    logger.error(
      `Could not read --assetReferencesManifest at ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger.error(
      `--assetReferencesManifest at ${manifestPath} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }

  const result = validateAssetReferencesManifest(parsed);
  if ("errorMessage" in result) {
    logger.error(result.errorMessage);
    process.exit(1);
  }

  return result.manifest;
};

const readSessionFilter = async (
  sessionFilterPath: string,
): Promise<SessionFilter> => {
  const logger = initLogger();
  const result = await readSessionFilterFile(sessionFilterPath);
  if (!result.valid) {
    logger.error(result.error);
    process.exit(1);
  }
  return result.filter;
};

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
  repoDirectory,
  assetReferencesManifest: manifestPath,
  rewrites,
  sessionFilter: sessionFilterPath,
  waitForBase,
  waitForTestRunToComplete,
}: Options): Promise<void> => {
  const logger = initLogger();

  if (
    waitForTestRunToComplete &&
    !hasGitContextForTestRunWait(repoDirectory, baseSha_, gitDiffOutput_)
  ) {
    logger.error(
      "--waitForTestRunToComplete is only for runs from a local branch checkout: pass --repoDirectory " +
        "(path to your clone on the branch under test) or both --baseSha and --gitDiffOutput from that branch. " +
        "If you only pass --commitSha you are not on a branch checkout — omit this flag.",
    );
    process.exit(1);
  }

  const { commitSha, baseSha, gitDiffOutput } = await resolveGitOptions({
    commitSha: commitSha_,
    baseSha: baseSha_,
    gitDiffOutput: gitDiffOutput_,
    repoDirectory,
  });

  if (baseSha && baseSha === commitSha && !gitDiffOutput) {
    logger.info(
      "Base SHA equals head SHA and no git diff output provided — nothing to test. " +
        "If you have uncommitted changes, provide --gitDiffOutput or use --repoDirectory.",
    );
    return;
  }

  const manifest = await readAssetReferencesManifest(manifestPath);

  if (manifestHasVersionLookupEntries(manifest)) {
    if (!baseSha) {
      logger.info(
        "The manifest contains versionLookup entries and no --baseSha was provided; " +
          "the backend will resolve them against the base test run it selects for this run, " +
          "and the run will fail if it cannot determine a base. " +
          "Pass --baseSha (or --repoDirectory, which infers it) to set the base explicitly.",
      );
    }
    if (!waitForBase && !waitForTestRunToComplete) {
      logger.warn(
        "The manifest contains versionLookup entries, which can only be resolved once a base test run exists. " +
          "--waitForBase=false cannot fall back to running without a base for such manifests; the trigger will fail if the base test run never appears.",
      );
    }
  }

  // Validated ahead of the trigger so a bad regex fails fast in the CLI
  // rather than after chunk resolution on the server.
  const sessionFilter = sessionFilterPath
    ? await readSessionFilter(sessionFilterPath)
    : undefined;

  logger.info(
    `Triggering test run for commit ${commitSha} against ${manifest.length} uploaded asset chunk(s)`,
  );

  Sentry.captureMessage("Received run-with-uploaded-asset-chunks request", {
    level: "debug",
    extra: { commitSha, chunkCount: manifest.length },
  });

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const projectIdentifier = await resolveProjectIdentifier(apiToken_);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  let testRunId: string;

  try {
    const result = await runWithUploadedAssetChunks({
      client,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      assetReferencesManifest: manifest,
      rewrites: parseRewrites(rewrites),
      waitForBase: waitForBase || waitForTestRunToComplete,
      ...(sessionFilter ? { sessionFilter } : {}),
      ...projectIdentifier,
    });
    // Emit overlaps as a single warn (stderr) before the null check so failure
    // paths that return overlaps without a test run still surface collisions.
    // On success, print the test-run URLs via logNotice (also stderr) after so
    // they land as a clean trailing block. Same-stream writes preserve order;
    // the old bug was logger.info (stdout) racing with per-line logger.warn
    // (stderr) under CI tools like Gradle that merge the streams
    // asynchronously. Verify the assembled build via `/download-build-assets`.
    if (result.overlaps && result.overlaps.length > 0) {
      const overlapLines = [
        `WARNING: ${result.overlaps.length} file path(s) appear in multiple chunks (computed over the fully resolved manifest, ` +
          `including any versionLookup entries resolved to concrete versions). ` +
          `Chunks later in the manifest win: the test run serves the later chunk's copy of each colliding path.`,
        ...result.overlaps.map(
          (overlap) =>
            `  - ${overlap.path}: served from ${overlap.upperChunk.name}@${overlap.upperChunk.versionId} (overriding ${overlap.lowerChunk.name}@${overlap.lowerChunk.versionId})`,
        ),
      ];
      if (result.overlapsTruncated) {
        overlapLines.push(`  ... and more overlapping paths (not shown).`);
      }
      overlapLines.push(
        `If this is unintentional, adjust your chunking scheme so no two chunks produce the same final path.`,
      );
      logger.warn(overlapLines.join("\n"));
    }

    if (!result.testRun) {
      throw new Error(
        result.message ?? "Asset chunks resolved but test run not created",
      );
    }
    testRunId = result.testRun.id;

    logNotice("");
    logNotice(`Test run created: ${result.testRun.url}`);
    logNotice(
      `Verify assembled build assets: ${result.testRun.url}/download-build-assets`,
    );
    logNotice("");
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }

  if (!waitForTestRunToComplete) {
    return;
  }

  logger.info(`Waiting for test run ${testRunId} to complete...`);

  let completedTestRun = await getTestRun({ client, testRunId });
  while (IN_PROGRESS_TEST_RUN_STATUS.includes(completedTestRun.status)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    completedTestRun = await getTestRun({ client, testRunId });
    logger.info(`Test run status: ${completedTestRun.status}`);
  }

  logger.info(
    `Test run ${testRunId} finished with status: ${completedTestRun.status}`,
  );
};

export const ciRunWithUploadedAssetChunksCommand: CommandModule<
  unknown,
  Options
> = {
  command: "run-with-uploaded-asset-chunks",
  describe:
    "Trigger a test run against already-uploaded asset chunks. Together with `upload-asset-chunk`, this is the chunked equivalent of `upload-assets`.",
  builder: {
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    baseSha: {
      string: true,
      description:
        "The base commit SHA to compare against. Intended for custom test run triggers. Cannot be combined with --repoDirectory.",
    },
    gitDiffOutput: {
      string: true,
      description:
        "Raw git diff output between the base and head commits. Requires --baseSha. Cannot be combined with --repoDirectory.",
    },
    repoDirectory: {
      string: true,
      description:
        "The path to a git repository. Intended for custom test run triggers. " +
        "Automatically infers --commitSha, --baseSha, and --gitDiffOutput from the repo. " +
        "Cannot be combined with --commitSha, --baseSha, or --gitDiffOutput.",
    },
    assetReferencesManifest: {
      string: true,
      demandOption: true,
      description:
        "Path to a JSON file containing a list of references to previously uploaded asset chunks (see `ci upload-asset-chunk`). " +
        'Each entry is either { name, versionId } (an explicit chunk version) or { name, versionLookup: "latest-in-history" } ' +
        "(resolves the version of an unchanged chunk from the base test run's history; the base is inferred automatically, or pass --baseSha to override it). " +
        "Chunked analog of --appDirectory / --appZip on `ci upload-assets`.",
    },
    rewrites: {
      string: true,
      default: "[]",
      description:
        "URL rewrite rules. This string should be a valid JSON array in the format described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array." +
        ' Note: if no rules are passed, or an empty list is passed, we default to the rewrite rule \'{ source: "**", destination: "/index.html" }\'.',
    },
    sessionFilter: {
      string: true,
      description:
        "Path to a JSON file restricting which sessions the test run replays, e.g." +
        ' \'{ "session-start-url-matches-any-regex": ["my-path/", "your-path/two/"] }\'.' +
        " This is an advanced option: Meticulous automatically chooses sessions to execute." +
        " sessionFilter allows additional filtering on top of that." +
        " We recommend checking with a Meticulous engineer before using it." +
        " See https://app.meticulous.ai/docs/how-to/filter-sessions-by-start-url.",
    },
    waitForBase: {
      boolean: true,
      default: true,
      description:
        "If true, the launcher will try to wait for a base test run to be created before triggering a test run.",
    },
    waitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "If true, block until the triggered test run finishes. Only for Meticulous runs tied to a local branch: " +
        "requires --repoDirectory (your clone on that branch) or both --baseSha and --gitDiffOutput from it. Implies --waitForBase.",
    },
  },
  handler: wrapHandler(handler),
};
