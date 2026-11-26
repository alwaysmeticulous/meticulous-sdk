import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClientWithOAuth,
  DEFAULT_TEST_RUN_REPLAYS_LIMIT,
  getTestRun,
  getTestRunReplays,
  isTestRunProcessingResponse,
  MAX_TEST_RUN_REPLAYS_LIMIT,
  type MeticulousClient,
  type TestRunReplay,
} from "@alwaysmeticulous/client";
import { logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { pollWhileProcessing } from "../../utils/poll-while-processing";
import {
  assertTestRunInProjectOrThrow,
  ensureTestRunFinished,
  resolveTestRunOrThrow,
} from "../../utils/resolve-test-run-from-commit";
import { pagingOptions } from "./paging-options.utils";
import { assertSingleRunSelector, prNumberOption } from "./pr-number-option";
import { logResponseNotes } from "./response-notes.utils";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  prNumber: number | undefined;
  project?: string | undefined;
  limit: number | undefined;
  offset: number | undefined;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
}

const COLUMNS: Array<{
  header: keyof TestRunReplay;
  value: (replay: TestRunReplay) => string;
}> = [
  { header: "sessionId", value: (replay) => replay.sessionId },
  { header: "result", value: (replay) => replay.result },
  { header: "headReplayId", value: (replay) => replay.headReplayId },
  { header: "baseReplayId", value: (replay) => replay.baseReplayId ?? "" },
  { header: "replayDiffId", value: (replay) => replay.replayDiffId ?? "" },
];

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  prNumber,
  project,
  limit,
  offset,
  dontWaitForTestRunToComplete,
  json,
}: Options): Promise<void> => {
  assertSingleRunSelector({ testRunId, prNumber, commitSha });
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const { resolvedTestRunId, status } = await resolveRun(client, {
    testRunId,
    commitSha,
    prNumber,
    project,
  });

  // A run that stopped short (ExecutionError, Aborted) still lists the sessions
  // it finished, which is what debugging it needs, so it isn't an error here.
  const finishedStatus = await ensureTestRunFinished(
    client,
    resolvedTestRunId,
    status,
    { dontWait: dontWaitForTestRunToComplete, throwOnFailure: false },
  );

  logProgress(`Fetching replays for test run ${resolvedTestRunId}...`);
  const request = () =>
    getTestRunReplays(client, resolvedTestRunId, { limit, offset });
  // With --dontWaitForTestRunToComplete (`finishedStatus == null`) the request
  // still goes out, once, so --json prints the backend's own processing body.
  const response =
    finishedStatus == null
      ? await request()
      : await pollWhileProcessing(request, {
          isProcessing: isTestRunProcessingResponse,
          waitingMessage: (first) => first.message,
          timeoutMessage: (last) =>
            `The replays of test run ${resolvedTestRunId} did not become available within 10 minutes. ${last.message}`,
        });

  if (isTestRunProcessingResponse(response)) {
    if (json) {
      printJson(response);
    }
    return;
  }

  if (json) {
    printJson(response.replays);
  } else {
    console.log(COLUMNS.map((column) => column.header).join("\t"));
    for (const replay of response.replays) {
      console.log(COLUMNS.map((column) => column.value(replay)).join("\t"));
    }
  }
  logResponseNotes(response);
};

const resolveRun = async (
  client: MeticulousClient,
  {
    testRunId,
    commitSha,
    prNumber,
    project,
  }: Pick<Options, "testRunId" | "commitSha" | "prNumber" | "project">,
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

export const testRunReplaysCommand: CommandModule<unknown, Options> = {
  command: "test-run-replays",
  describe: `Get the list of replays for a given test run (defaults to the current git HEAD): one per session it replayed, including the sessions with no differences, so a run with no diffs still names its replays (default: limit to ${DEFAULT_TEST_RUN_REPLAYS_LIMIT} rows). Outputs a TSV table with columns sessionId, result, headReplayId, baseReplayId, replayDiffId, where result is pass (every screenshot matched the base), fail (a screenshot differs) or flake (the difference didn't reproduce), baseReplayId is empty when the session had no base replay to compare against, and replayDiffId is empty when no replay diff was recorded. Pass a replay ID to 'agent timeline', 'agent dom' or 'agent js-coverage --replayId', or a replayDiffId to 'agent timeline-diff', to inspect a replay. Pagination, and any caveat about the run, are reported on stderr. Blocks until the test run has finished by default, for at most 10 minutes.`,
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      description:
        "The test run ID. When omitted, the run is looked up from --prNumber or --commitSha, or from the current git HEAD when neither is given.",
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
        "The project to look up the commit or pull request in (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s). With --testRunId it is optional, and must name the test run's own project.",
    },
    ...pagingOptions("replays", MAX_TEST_RUN_REPLAYS_LIMIT),
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        'Exit immediately instead of waiting for an in-progress test run; it is then reported on stderr, and with --json as the backend\'s { status: "processing" } body.',
    },
  },
  handler: wrapHandler(handler),
};
