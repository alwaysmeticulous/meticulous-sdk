import { TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClient,
  getTestRun,
  getTestRunDiffsSummary,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  awaitTestRunCompletion,
  isTestRunComplete,
  isTestRunFailed,
  isTestRunInProgress,
  isTestRunPartial,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";
import {
  buildDiffsSummaryHeader,
  flattenDiffRows,
  formatDiffRow,
  resolveIncludeAllDiffs,
} from "./test-run-diffs.utils";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  waitForTestRunToComplete: boolean;
  includeReplayIds: boolean;
  includeDomDiffIds: boolean;
  includeAllDiffs: boolean;
  includeMatches: boolean;
  orderByReplayDiffs: boolean;
  verbose: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Give up polling the diffs summary after this long, rather than forever. */
const SUMMARY_POLL_TIMEOUT_MS = 10 * 60_000;

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  waitForTestRunToComplete,
  includeReplayIds,
  includeDomDiffIds,
  includeAllDiffs,
  includeMatches,
  orderByReplayDiffs,
  verbose,
}: Options): Promise<void> => {
  initLogger();

  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const client = createClient({ apiToken: apiToken_ });

  // Use --testRunId, else resolve the run from --commitSha or, when neither is
  // given, from the local checkout's HEAD.
  let resolvedTestRunId: string;
  let status: TestRunStatus;
  if (testRunId != null) {
    resolvedTestRunId = testRunId;
    status = (await getTestRun({ client, testRunId })).status;
  } else {
    const run = await resolveTestRunForCommitOrThrow(
      client,
      apiToken_,
      commitSha,
    );
    resolvedTestRunId = run.testRunId;
    status = run.status;
  }

  // Diffs are only meaningful once the run has finished with a verdict
  // (Success/Failure). Wait if asked and the run is still in progress, then
  // classify the resulting status.
  if (waitForTestRunToComplete && isTestRunInProgress(status)) {
    status = await awaitTestRunCompletion(client, resolvedTestRunId);
  }

  if (isTestRunFailed(status)) {
    throw new CliUserError(
      `Test run ${resolvedTestRunId} finished unsuccessfully (status: ${status}).`,
    );
  }

  if (isTestRunPartial(status)) {
    // A Partial run is a session-pool base, not a test run for a specific
    // change: it executes sessions on demand for other PRs and never finishes
    // on its own, so it has no meaningful set of diffs. Reject it rather than
    // suggest waiting (which would be a no-op).
    throw new CliUserError(
      `Test run ${resolvedTestRunId} is a session-pool base run (status: Partial), not a test run for a specific change, so it has no diffs to show.`,
    );
  }

  if (!isTestRunComplete(status)) {
    // Still in progress and the caller didn't wait — diffs aren't available
    // yet, so report and stop. Waiting would let it finish with a verdict.
    const hint = waitForTestRunToComplete
      ? ""
      : " Pass --waitForTestRunToComplete to block until it finishes and then show diffs.";
    log(
      `Test run ${resolvedTestRunId} is not complete (status: ${status}).${hint}`,
    );
    return;
  }

  const t0 = performance.now();

  log(`Fetching diffs summary for test run ${resolvedTestRunId}...`);

  // --includeMatches implies --includeAllDiffs (matches are never part of the
  // selected subset, so they only make sense alongside the full set). Use the
  // effective value for both the request and the isSelected column.
  const allDiffs = resolveIncludeAllDiffs({ includeAllDiffs, includeMatches });

  const diffsSummaryOptions = {
    includeReplayIds,
    includeDomDiffIds,
    includeAllDiffs: allDiffs,
    includeMatches,
    orderByReplayDiffs,
  };

  let response = await getTestRunDiffsSummary(
    client,
    resolvedTestRunId,
    diffsSummaryOptions,
  );

  // Poll until complete (or give up after the timeout, rather than forever).
  const summaryDeadline = performance.now() + SUMMARY_POLL_TIMEOUT_MS;
  while (response.status === "pending" || response.status === "processing") {
    if (verbose) log(`Status: ${response.status}`);
    if (performance.now() >= summaryDeadline) {
      log(
        `Diffs summary for test run ${resolvedTestRunId} did not complete within 10 minutes ` +
          `(status: ${response.status}). Something may have gone wrong — try again later.`,
      );
      process.exit(1);
    }
    await sleep(2000);
    response = await getTestRunDiffsSummary(
      client,
      resolvedTestRunId,
      diffsSummaryOptions,
    );
  }

  if (response.status !== "complete") {
    log(`Error: unexpected status "${response.status}"`);
    process.exit(1);
  }

  const data = response.data ?? [];

  if (data.length === 0) {
    log("No replay diffs found for this test run.");
    return;
  }

  // The backend sets `index` to the priority rank by default, or the
  // within-replay position (with `total`) when orderByReplayDiffs is set.
  const rows = flattenDiffRows(data, orderByReplayDiffs);
  const columns = {
    orderByReplayDiffs,
    includeDomDiffIds,
    includeAllDiffs: allDiffs,
    includeReplayIds,
  };

  console.log(buildDiffsSummaryHeader(columns).join("\t"));

  let totalDiffScreenshots = 0;

  for (const row of rows) {
    if (row.screenshot.userVisibleOutcome === "difference") {
      totalDiffScreenshots++;
    }
    console.log(formatDiffRow(row, columns).join("\t"));
  }

  const tEnd = performance.now();
  log(
    `${data.length} replay diff(s), ${totalDiffScreenshots} screenshot diff(s), total ${((tEnd - t0) / 1000).toFixed(1)}s`,
  );
};

export const testRunDiffsCommand: CommandModule<unknown, Options> = {
  command: "test-run-diffs",
  describe: "List replay diffs for a test run with summary",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    testRunId: {
      string: true,
      description:
        "The test run ID. When omitted, the run is resolved from --commitSha, or from the local git HEAD when that is also omitted.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: the latest test run for the commit is resolved and used. Defaults to the local git HEAD when neither --testRunId nor --commitSha is given.",
    },
    waitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "If the test run is still in progress, block until it finishes before fetching diffs (otherwise an in-progress run is reported and the command exits).",
    },
    includeReplayIds: {
      boolean: true,
      description: "Include base and head replay IDs per replay diff",
      default: false,
    },
    includeDomDiffIds: {
      boolean: true,
      description:
        "Add a domDiffIds column grouping screenshots by structural DOM change",
      default: false,
    },
    includeAllDiffs: {
      boolean: true,
      description:
        "Return every diff instead of only the selected representative subset; adds an isSelected column",
      default: false,
    },
    includeMatches: {
      boolean: true,
      description:
        "Include matching screenshots (matches, known flakes), not just differences. Implies --includeAllDiffs.",
      default: false,
    },
    orderByReplayDiffs: {
      boolean: true,
      description:
        "Order rows by replay diff then event index (instead of by selection priority) and include the index/total columns",
      default: false,
    },
    verbose: {
      boolean: true,
      description: "Show polling status updates",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
