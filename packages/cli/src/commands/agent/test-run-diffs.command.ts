import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClientWithOAuth,
  getTestRun,
  getTestRunDiffsSummary,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  assertTestRunComplete,
  ensureTestRunFinished,
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
  dontWaitForTestRunToComplete: boolean;
  includeReplayIds: boolean;
  includeDomDiffIds: boolean;
  includeAllDiffs: boolean;
  includeMatches: boolean;
  orderByReplayDiffs: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Give up polling the diffs summary after this long, rather than forever. */
const SUMMARY_POLL_TIMEOUT_MS = 10 * 60_000;

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  dontWaitForTestRunToComplete,
  includeReplayIds,
  includeDomDiffIds,
  includeAllDiffs,
  includeMatches,
  orderByReplayDiffs,
}: Options): Promise<void> => {
  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

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
  // (Success/Failure). Block until it finishes (default) or, with
  // --dontWaitForTestRunToComplete, report the in-progress run and stop.
  const finishedStatus = await ensureTestRunFinished(
    client,
    resolvedTestRunId,
    status,
    { dontWait: dontWaitForTestRunToComplete },
  );
  if (finishedStatus == null) {
    return;
  }

  // Reject session-pool bases (Partial, which never finish on their own and
  // aren't tied to a change); fatal failures already threw while waiting.
  assertTestRunComplete(resolvedTestRunId, finishedStatus, {
    resultName: "diffs",
  });

  const t0 = performance.now();

  logProgress(`Fetching diffs summary for test run ${resolvedTestRunId}...`);

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
  // A single line when we start waiting — no per-poll output.
  const summaryDeadline = performance.now() + SUMMARY_POLL_TIMEOUT_MS;
  if (response.status === "pending" || response.status === "processing") {
    logProgress(
      `Waiting for diff results for test run ${resolvedTestRunId}...`,
    );
  }
  while (response.status === "pending" || response.status === "processing") {
    if (performance.now() >= summaryDeadline) {
      logNotice(
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
    logNotice(`Error: unexpected status "${response.status}"`);
    process.exit(1);
  }

  const data = response.data ?? [];

  if (data.length === 0) {
    logNotice(`Test run ${resolvedTestRunId} does not have diffs.`);
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
  logNotice(
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
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "By default, if the test run is still in progress the command blocks until it finishes before fetching diffs. Pass this to instead report the in-progress run and exit immediately.",
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
  },
  handler: wrapHandler(handler),
};
