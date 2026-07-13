import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClientWithOAuth,
  type DiffsSummaryCountsResponse,
  getTestRun,
  getTestRunDiffsSummary,
  getTestRunDiffsSummaryCounts,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  assertTestRunComplete,
  ensureTestRunFinished,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";
import {
  buildDiffsSummaryHeader,
  buildDiffsSummaryJson,
  flattenDiffRows,
  formatDiffRow,
  formatDiffsSummaryCounts,
} from "./test-run-diffs.utils";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  includeReplayIds: boolean;
  includeReviewDecisions: boolean;
  includeDomDiffIds: boolean;
  includeAllDiffs: boolean;
  onlyUnreviewed: boolean;
  orderByReplayDiffs: boolean;
  counts: boolean;
  json: boolean;
  project?: string | undefined;
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
  includeReviewDecisions,
  includeDomDiffIds,
  includeAllDiffs,
  onlyUnreviewed,
  orderByReplayDiffs,
  counts,
  json,
  project,
}: Options): Promise<void> => {
  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }

  // --counts reports fixed aggregate totals from a dedicated endpoint that takes
  // no list/filter options, so combining it with any of them is meaningless —
  // reject it rather than silently ignoring them. Only --json (output format) and
  // --dontWaitForTestRunToComplete (in-progress handling) remain compatible.
  if (counts) {
    const incompatible = (
      [
        [includeReplayIds, "--includeReplayIds"],
        [includeDomDiffIds, "--includeDomDiffIds"],
        [includeAllDiffs, "--includeAllDiffs"],
        [orderByReplayDiffs, "--orderByReplayDiffs"],
        [includeReviewDecisions, "--includeReviewDecisions"],
        [onlyUnreviewed, "--onlyUnreviewed"],
      ] as const
    )
      .filter(([enabled]) => enabled)
      .map(([, name]) => name);
    if (incompatible.length > 0) {
      throw new CliUserError(
        `--counts cannot be combined with: ${incompatible.join(", ")}. ` +
          `It reports fixed aggregate totals; use it on its own (optionally with --json).`,
      );
    }
  }

  // `--counts` reports only aggregate totals (no per-row list); the same numbers
  // whether or not `--json` is set, just as an object vs `key\tvalue` lines.
  const emitCounts = (summaryCounts: DiffsSummaryCountsResponse): void => {
    if (json) {
      printJson(summaryCounts);
    } else {
      for (const line of formatDiffsSummaryCounts(summaryCounts)) {
        console.log(line);
      }
    }
  };

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
      commitSha,
      project,
    );
    resolvedTestRunId = run.testRunId;
    status = run.status;
  }

  // --onlyUnreviewed spans every unreviewed difference (selected or not), so it
  // implies --includeAllDiffs: the isSelected column is included to tell them
  // apart, matching the backend, which resolves the same implication.
  const includeAllDiffsResolved = includeAllDiffs || onlyUnreviewed;

  const columns = {
    orderByReplayDiffs,
    includeDomDiffIds,
    includeAllDiffs: includeAllDiffsResolved,
    includeReplayIds,
    includeReviewDecisions,
  };

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
    // The in-progress notice already went to stderr (ensureTestRunFinished).
    // For the list, keep stdout's shape stable — an unfinished run has no diffs
    // yet, so emit an empty JSON array / header-only TSV (matching a finished run
    // with zero diffs). --counts has no such empty shape: it reports live totals,
    // so emit nothing rather than a row of zeros that would read as a real,
    // fully-reviewed result.
    if (!counts) {
      if (json) {
        console.log("[]");
      } else {
        console.log(buildDiffsSummaryHeader(columns).join("\t"));
      }
    }
    return;
  }

  // Reject session-pool bases (Partial, which never finish on their own and
  // aren't tied to a change); fatal failures already threw while waiting.
  assertTestRunComplete(resolvedTestRunId, finishedStatus, {
    resultName: "diffs",
  });

  // `--counts` comes from a dedicated endpoint computed live from the DB, so it
  // needs neither the (potentially large) diffs list nor the summary poll below.
  if (counts) {
    emitCounts(await getTestRunDiffsSummaryCounts(client, resolvedTestRunId));
    return;
  }

  const t0 = performance.now();

  logProgress(`Fetching diffs summary for test run ${resolvedTestRunId}...`);

  const diffsSummaryOptions = {
    includeReplayIds,
    includeDomDiffIds,
    includeAllDiffs: includeAllDiffsResolved,
    orderByReplayDiffs,
    includeReviewDecisions,
    onlyUnreviewed,
  };

  let response = await getTestRunDiffsSummary(
    client,
    resolvedTestRunId,
    diffsSummaryOptions,
  );

  // A cold start finding the last computation already `failed` retriggers
  // once, up front — before the poll deadline below is computed, so the fresh
  // run always gets the full timeout. This is a one-shot decision made only
  // here, not inside the poll loop: once we're polling, a `failed` result is
  // reported and the command exits, it never retriggers again.
  if (response.status === "failed") {
    logProgress(
      `Diffs computation failed for test run ${resolvedTestRunId}; retriggering...`,
    );
    response = await getTestRunDiffsSummary(client, resolvedTestRunId, {
      ...diffsSummaryOptions,
      retrigger: true,
    });
  }

  // Poll until complete (or give up after the timeout, rather than forever).
  // A single line when we start waiting — no per-poll output.
  const summaryDeadline = performance.now() + SUMMARY_POLL_TIMEOUT_MS;
  if (response.status === "pending" || response.status === "processing") {
    logProgress(
      `Waiting for diff results for test run ${resolvedTestRunId}...`,
    );
  }
  while (response.status !== "complete") {
    if (response.status === "failed") {
      const reasonSuffix =
        response.reason != null ? ` (${response.reason})` : "";
      logNotice(
        `Diffs summary computation failed${reasonSuffix} for test run ${resolvedTestRunId}. ` +
          `Something may have gone wrong — try again later.`,
      );
      process.exit(1);
    }
    if (response.status !== "pending" && response.status !== "processing") {
      logNotice(`Error: unexpected status "${String(response.status)}"`);
      process.exit(1);
    }
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

  const data = response.data ?? [];
  // The backend sets `index` to a global rank — a flat priority rank by default,
  // or a replayDiff-grouped rank under orderByReplayDiffs; rows sort by it.
  const rows = flattenDiffRows(data);

  if (json) {
    printJson(buildDiffsSummaryJson(data, columns));
  } else {
    // Always emit the TSV header so a zero-diff run is a header with no rows (the
    // same shape as the in-progress short-circuit above), never empty stdout.
    console.log(buildDiffsSummaryHeader(columns).join("\t"));
    for (const row of rows) {
      console.log(formatDiffRow(row, columns).join("\t"));
    }
  }

  // Summaries on stderr regardless of --json (which only changes stdout).
  if (data.length === 0) {
    logNotice(`Test run ${resolvedTestRunId} does not have diffs.`);
    return;
  }

  const totalDiffScreenshots = rows.filter(
    (row) => row.screenshot.userVisibleOutcome === "difference",
  ).length;
  const tEnd = performance.now();
  logNotice(
    `${data.length} replay diff(s), ${totalDiffScreenshots} screenshot diff(s), total ${((tEnd - t0) / 1000).toFixed(1)}s`,
  );
};

export const testRunDiffsCommand: CommandModule<unknown, Options> = {
  command: "test-run-diffs",
  describe:
    "List replay diffs for a test run. Outputs TSV, one row per screenshot diff: replayDiffId, screenshotName, index, outcome, mismatch (plus optional columns depending on flags), or the same data with --json (nested by replay diff under --orderByReplayDiffs). Pass --counts to print just the totals instead of the list.",
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
    includeReviewDecisions: {
      boolean: true,
      description:
        "Add a decision column with the PR review decision per diff (accepted/rejected/ignored/unreviewed; unreviewed when undecided or no PR)",
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
    onlyUnreviewed: {
      boolean: true,
      description:
        "Return only diffs still awaiting review (decision unreviewed), across every difference rather than just the selected subset — i.e. everything left to review. Implies --includeAllDiffs, so the isSelected column is included to tell selected from unselected differences.",
      default: false,
    },
    orderByReplayDiffs: {
      boolean: true,
      description:
        "With --json, group screenshots by replay diff instead of a flat list; the index is then a replayDiff-grouped rank rather than a flat priority rank",
      default: false,
    },
    project: {
      string: true,
      description:
        "Project to resolve --commitSha against (id, 'organization/name', or a bare name unique among your accessible projects). Cannot be combined with --testRunId (the run already determines the project). One-off override for this call only; when omitted, uses the token's project or the default set via `auth set-project`.",
      conflicts: "testRunId",
    },
    counts: {
      boolean: true,
      description:
        "Print only aggregate totals (num replays, num diffs, and the review-decision breakdown) instead of the per-diff list. Cannot be combined with the list/filter flags (--includeReplayIds, --includeDomDiffIds, --includeAllDiffs, --orderByReplayDiffs, --includeReviewDecisions, --onlyUnreviewed); may be combined with --json.",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
