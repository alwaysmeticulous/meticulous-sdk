import { readFile } from "fs/promises";
import {
  createClient,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
  ProjectAssetChunkReference,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { runWithUploadedAssetChunks } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { parseRewrites } from "../../command-utils/parse-rewrites";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { isOutOfDateClientError, OutOfDateCLIError } from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { hasGitContextForTestRunWait, resolveGitOptions } from "./resolve-git-options";

const POLL_INTERVAL_MS = 10_000;

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;
  assetReferencesManifest: string;
  rewrites?: string;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
  dryRun?: boolean;
}

const readAssetReferencesManifest = async (
  manifestPath: string,
): Promise<ProjectAssetChunkReference[]> => {
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

  if (!Array.isArray(parsed)) {
    logger.error(`--assetReferencesManifest must be a JSON array of { name, versionId } objects.`);
    process.exit(1);
  }

  const isValid = parsed.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { name?: unknown }).name === "string" &&
      typeof (item as { versionId?: unknown }).versionId === "string" &&
      (item as { name: string }).name.length > 0 &&
      (item as { versionId: string }).versionId.length > 0,
  );
  if (!isValid) {
    logger.error(
      `--assetReferencesManifest entries must each be { name: string, versionId: string } with non-empty values.`,
    );
    process.exit(1);
  }

  return parsed as ProjectAssetChunkReference[];
};

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
  repoDirectory,
  assetReferencesManifest: manifestPath,
  rewrites,
  waitForBase,
  waitForTestRunToComplete,
  dryRun,
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

  const { commitSha, baseSha, gitDiffOutput, withUncommittedChanges } = await resolveGitOptions({
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

  logger.info(
    `Triggering test run for commit ${commitSha} against ${manifest.length} uploaded asset chunk(s)`,
  );

  if (dryRun) {
    logger.info(
      `Dry run: would trigger a test run for commit ${commitSha}${baseSha ? ` (base: ${baseSha})` : ""} against ${manifest.length} uploaded asset chunk(s)`,
    );
    return;
  }

  Sentry.captureMessage("Received run-with-uploaded-asset-chunks request", {
    level: "debug",
    extra: { commitSha, chunkCount: manifest.length },
  });

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const projectIdentifier = resolveProjectIdentifier(apiToken_);
  const client = createClient({ apiToken: apiToken_ });

  let testRunId: string | null;

  try {
    const result = await runWithUploadedAssetChunks({
      client,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
      assetReferencesManifest: manifest,
      rewrites: parseRewrites(rewrites),
      waitForBase: waitForBase || waitForTestRunToComplete,
      ...projectIdentifier,
    });
    testRunId = result.testRun?.id ?? null;
    if (result.overlaps && result.overlaps.length > 0) {
      logger.warn(
        `${result.overlaps.length} file path(s) appear in multiple chunks. Later chunks in the manifest override earlier ones.`,
      );
      for (const overlap of result.overlaps) {
        logger.warn(
          `  - ${overlap.path}: ${overlap.lowerChunk.name}@${overlap.lowerChunk.versionId} → ${overlap.upperChunk.name}@${overlap.upperChunk.versionId}`,
        );
      }
      if (result.overlapsTruncated) {
        logger.warn(`  ... and more overlapping paths (not shown).`);
      }
    }
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }

  if (!waitForTestRunToComplete || !testRunId) {
    return;
  }

  logger.info(`Waiting for test run ${testRunId} to complete...`);

  let completedTestRun = await getTestRun({ client, testRunId });
  while (IN_PROGRESS_TEST_RUN_STATUS.includes(completedTestRun.status)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    completedTestRun = await getTestRun({ client, testRunId });
    logger.info(`Test run status: ${completedTestRun.status}`);
  }

  logger.info(`Test run ${testRunId} finished with status: ${completedTestRun.status}`);
};

export const ciRunWithUploadedAssetChunksCommand: CommandModule<unknown, Options> = {
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
        "Path to a JSON file containing a list of { name, versionId } references to previously uploaded asset chunks (see `ci upload-asset-chunk`). " +
        "Chunked analog of --appDirectory / --appZip on `ci upload-assets`.",
    },
    rewrites: {
      string: true,
      default: "[]",
      description:
        "URL rewrite rules. This string should be a valid JSON array in the format described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array." +
        ' Note: if no rules are passed, or an empty list is passed, we default to the rewrite rule \'{ source: "**", destination: "/index.html" }\'.',
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
