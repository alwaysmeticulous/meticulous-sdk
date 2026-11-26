import type { TestRunStatus } from "@alwaysmeticulous/api";
import { logNotice } from "@alwaysmeticulous/common";
import {
  createClientWithOAuth,
  getProjectJsCoverageSummary,
  getTestRun,
  getTestRunCoverageLcov,
  isFetchError,
  type CoverageLcovResponse,
  type CoverageLcovScope,
  type MeticulousClient,
} from "@alwaysmeticulous/client";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { createGunzip } from "zlib";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { errorResponseBody } from "../../utils/error-response-body";
import { pollWhileProcessing } from "../../utils/poll-while-processing";
import {
  assertTestRunInProjectOrThrow,
  ensureTestRunFinished,
  resolveTestRunOrThrow,
} from "../../utils/resolve-test-run-from-commit";
import { requireIdArgument } from "../agent/argument-validation.utils";
import {
  assertSingleRunSelector,
  prNumberOption,
} from "../agent/pr-number-option";

const COVERAGE_LCOV_SCOPES = ["executed", "selected-set"] as const;

/** A large run's per-case file can take longer than the usual result wait. */
const COVERAGE_EXPORT_TIMEOUT_MS = 45 * 60_000;

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  prNumber: number | undefined;
  project: string | undefined;
  latestForProject: boolean;
  scope: CoverageLcovScope;
  output: string;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
}

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  prNumber,
  project,
  latestForProject,
  scope,
  output,
  dontWaitForTestRunToComplete,
  json,
}: Options): Promise<void> => {
  if (testRunId === "latest") {
    throw new CliUserError(
      "download coverage does not resolve --testRunId=latest. Pass --latestForProject for the run the project coverage page uses.",
    );
  }
  assertSingleRunSelector({ testRunId, prNumber, commitSha });
  if (
    latestForProject &&
    (testRunId != null || prNumber != null || commitSha != null)
  ) {
    throw new CliUserError(
      "Pass --latestForProject on its own, without --testRunId, --prNumber or --commitSha.",
    );
  }
  if (testRunId != null) {
    requireIdArgument("testRunId", testRunId);
  }

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const { resolvedTestRunId, status } = await resolveRun(client, {
    testRunId,
    commitSha,
    prNumber,
    project,
    latestForProject,
  });
  const finishedStatus = await ensureTestRunFinished(
    client,
    resolvedTestRunId,
    status,
    { dontWait: dontWaitForTestRunToComplete, throwOnFailure: false },
  );
  if (finishedStatus == null) {
    if (json) {
      printJson({ testRunId: resolvedTestRunId, status });
    }
    return;
  }

  const request = () => requestCoverage(client, resolvedTestRunId, scope);
  if (dontWaitForTestRunToComplete) {
    const response = await request();
    if (response.status === "processing") {
      logNotice(response.message);
      if (json) {
        printJson(response);
      }
      return;
    }
    await writeCoverage(response, output, json);
    return;
  }
  const ready = await pollWhileProcessing(request, {
    isProcessing: (
      value,
    ): value is Extract<CoverageLcovResponse, { status: "processing" }> =>
      value.status === "processing",
    waitingMessage: (first) => first.message,
    timeoutMs: COVERAGE_EXPORT_TIMEOUT_MS,
    timeoutMessage: (last) =>
      `${last.message} The export is still rendering; run the command again to keep waiting.`,
  });

  await writeCoverage(ready, output, json);
};

const writeCoverage = async (
  ready: Extract<CoverageLcovResponse, { status: "ready" }>,
  output: string,
  json: boolean,
): Promise<void> => {
  const casesPath = casesPathFor(output);
  await mkdir(dirname(output), { recursive: true });
  await Promise.all([
    downloadGzip(ready.lcovUrl, output),
    downloadGzip(ready.casesUrl, casesPath),
  ]);

  if (json) {
    printJson({
      testRunId: ready.testRunId,
      executionSha: ready.executionSha,
      scope: ready.scope,
      lcovPath: output,
      casesPath,
      sessions: ready.sessions,
      measuredSessions: ready.measuredSessions,
      reusedSessions: ready.reusedSessions,
      transferredSessions: ready.transferredSessions,
      files: ready.files,
      executedLines: ready.executedLines,
      executableLines: ready.executableLines,
      complete: ready.complete,
    });
    return;
  }
  logNotice(
    `${ready.scope}: ${ready.executedLines} of ${ready.executableLines} lines, ${ready.sessions} cases (${ready.measuredSessions} measured on this commit, ${ready.reusedSessions} reused from the same build, ${ready.transferredSessions} moved forward).`,
  );
  console.log(output);
};

const resolveRun = async (
  client: MeticulousClient,
  {
    testRunId,
    commitSha,
    prNumber,
    project,
    latestForProject,
  }: {
    testRunId: string | undefined;
    commitSha: string | undefined;
    prNumber: number | undefined;
    project: string | undefined;
    latestForProject: boolean;
  },
): Promise<{ resolvedTestRunId: string; status: TestRunStatus }> => {
  if (latestForProject) {
    const { summary } = await getProjectJsCoverageSummary(client, { project });
    if (summary == null) {
      throw new CliUserError(
        "This project has no coverage run to export. The project coverage page has nothing to show.",
      );
    }
    const run = await getTestRun({ client, testRunId: summary.testRunId });
    return { resolvedTestRunId: summary.testRunId, status: run.status };
  }
  if (testRunId != null) {
    const [, run] = await Promise.all([
      assertTestRunInProjectOrThrow(client, testRunId, project),
      getTestRun({ client, testRunId }),
    ]);
    return { resolvedTestRunId: testRunId, status: run.status };
  }
  const resolved = await resolveTestRunOrThrow(client, {
    commitSha,
    prNumber,
    project,
  });
  return { resolvedTestRunId: resolved.testRunId, status: resolved.status };
};

const requestCoverage = async (
  client: MeticulousClient,
  testRunId: string,
  scope: CoverageLcovScope,
): Promise<CoverageLcovResponse> => {
  try {
    return await getTestRunCoverageLcov({ client, testRunId, scope });
  } catch (error) {
    throw asCoverageExportError(error);
  }
};

const asCoverageExportError = (error: unknown): unknown => {
  if (!isFetchError(error)) {
    return error;
  }
  const status = error.response?.status;
  const message = errorResponseBody(error)?.message ?? "";
  if (status === 404 && message.startsWith("Cannot GET")) {
    return new CliUserError(
      "This Meticulous backend does not support downloading coverage yet.",
    );
  }
  if (status === 400 || status === 403 || status === 404) {
    return new CliUserError(message || "Could not download coverage.");
  }
  return error;
};

const casesPathFor = (outputPath: string): string =>
  outputPath.endsWith(".lcov")
    ? `${outputPath.slice(0, -".lcov".length)}.cases.tsv`
    : `${outputPath}.cases.tsv`;

const downloadGzip = async (
  url: string,
  destination: string,
): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok || response.body == null) {
    throw new Error(
      `Downloading coverage failed (${response.status} ${response.statusText}).`,
    );
  }
  await pipeline(
    Readable.fromWeb(response.body as unknown as NodeReadableStream),
    createGunzip(),
    createWriteStream(destination),
  );
};

export const downloadCoverageCommand: CommandModule<unknown, Options> = {
  command: "coverage",
  describe:
    "Download line coverage for a test run as an LCOV file (defaults to the run for the current git HEAD). Writes the file given by --output, and a cases table next to it. Prints the file path.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      description:
        "The test run ID. When omitted, the run is looked up from --prNumber or --commitSha, or from the current git HEAD when neither is given. For the run the project coverage page uses, pass --latestForProject instead.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: looks up the latest test run for the commit. Defaults to the current git HEAD when none of --testRunId, --prNumber and --commitSha is given.",
    },
    prNumber: prNumberOption(),
    project: {
      string: true,
      description:
        "The project to look up the commit, pull request or coverage run in (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s). With a specific --testRunId, the run must belong to this project.",
    },
    latestForProject: {
      boolean: true,
      default: false,
      // No yargs-level `conflicts`: yargs treats an option as present once it
      // has a value, including this default of false, so a conflict with
      // --testRunId would reject every explicit run. The handler checks the
      // actual flag instead.
      description:
        "Export coverage for the run the project coverage page uses, instead of the run for the current git HEAD. Pass --scope=selected-set for that run's full selected set.",
    },
    scope: {
      choices: [...COVERAGE_LCOV_SCOPES],
      default: "executed" as CoverageLcovScope,
      description:
        "Which cases to include. executed (the default) is the cases this run replayed, every hit measured on this commit. selected-set is every session the run is configured with: cases replayed here, cases reused from the same build, and cases whose coverage was moved forward from an earlier commit. selected-set fails, and names the gap, when that picture is incomplete.",
    },
    output: {
      string: true,
      default: "coverage.lcov",
      description:
        "Where to write the LCOV file. The cases table is written beside it, with .lcov replaced by .cases.tsv (coverage.lcov becomes coverage.cases.tsv).",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "By default, if the test run is still in progress, or its coverage file is still being built, the command waits. Pass this to exit immediately instead. An unfinished run is reported on stderr, and with --json as { testRunId, status }.",
    },
  },
  handler: wrapHandler(handler),
};
