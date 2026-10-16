import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClientWithOAuth,
  getTestRun,
  type MeticulousClient,
} from "@alwaysmeticulous/client";
import type { TestRunDownloadScope } from "@alwaysmeticulous/downloading-helpers";
import {
  getOrFetchTestRunData,
  isTestRunDataWithheldError,
  TEST_RUN_DOWNLOAD_SCOPES,
} from "@alwaysmeticulous/downloading-helpers";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
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

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  prNumber: number | undefined;
  project: string | undefined;
  scope: TestRunDownloadScope;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
}

const LATEST_TEST_RUN_ID = "latest";

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  prNumber,
  project,
  scope,
  dontWaitForTestRunToComplete,
  json,
}: Options): Promise<void> => {
  assertSingleRunSelector({ testRunId, prNumber, commitSha });
  if (testRunId != null) {
    requireIdArgument("testRunId", testRunId);
  }

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  // `latest` is resolved server-side, and only ever to a finished run, so
  // there is nothing to wait for.
  if (testRunId === LATEST_TEST_RUN_ID) {
    await downloadAndPrint(client, LATEST_TEST_RUN_ID, {
      scope,
      latestFromProject: project,
      json,
    });
    return;
  }

  const { resolvedTestRunId, status } = await resolveRun(client, {
    testRunId,
    commitSha,
    prNumber,
    project,
  });
  // Failed runs are still worth downloading — their app container logs
  // especially — so only an unfinished run stops here.
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
  await downloadAndPrint(client, resolvedTestRunId, { scope, json });
};

const resolveRun = async (
  client: MeticulousClient,
  {
    testRunId,
    commitSha,
    prNumber,
    project,
  }: {
    testRunId: string | undefined;
    commitSha: string | undefined;
    prNumber: number | undefined;
    project: string | undefined;
  },
): Promise<{ resolvedTestRunId: string; status: TestRunStatus }> => {
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

const downloadAndPrint = async (
  client: MeticulousClient,
  testRunId: string,
  {
    scope,
    latestFromProject,
    json,
  }: {
    scope: TestRunDownloadScope;
    /** Only with `latest`: the project whose latest run to resolve. */
    latestFromProject?: string | undefined;
    json: boolean;
  },
): Promise<void> => {
  const { fileName: path, data } = await getOrFetchTestRunData(
    client,
    testRunId,
    scope,
    latestFromProject,
  ).catch((error: unknown) => {
    if (isTestRunDataWithheldError(error)) {
      throw new CliUserError(error.message, 1, "error", {
        testRunId: error.testRunId,
      });
    }
    throw error;
  });
  if (json) {
    printJson({ testRunId: data.testRunId, path });
  } else {
    console.log(path);
  }
};

export const downloadTestRunCommand: CommandModule<unknown, Options> = {
  command: "test-run",
  describe:
    "Download the data for a given test run (defaults to the latest test run for the current git HEAD). Outputs the local directory it was written to.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      description:
        "The test run ID, or 'latest' for the project's latest test run on the main branch. When omitted, the run is looked up from --prNumber or --commitSha, or from the current git HEAD when neither is given.",
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
        "The project to look up the commit, pull request or latest test run in (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s). With a specific --testRunId, the run must belong to this project.",
    },
    scope: {
      choices: [...TEST_RUN_DOWNLOAD_SCOPES],
      default: "coverage-only" as TestRunDownloadScope,
      description:
        "Which of the test run's artifacts to download: coverage-only (whole-run coverage.json and coverage-stats.json), app-container-logs, coverage-pr-only (the same, restricted to the lines the pull request changed), coverage-by-replay-pr-only (per-replay coverage of those lines), or everything. Downloading another scope for the same run later only fetches the files not yet downloaded. File formats other than coverage-only and app-container-logs are internal and may change.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "By default, if the test run is still in progress the command blocks until it finishes before downloading. Pass this to instead exit immediately without downloading; an unfinished run is then reported on stderr, and with --json as { testRunId, status }.",
    },
  },
  handler: wrapHandler(handler),
};
