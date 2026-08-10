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
  isTestRunPartial,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";
import {
  buildDiffsSummaryHeader,
  formatDiffRow,
  formatDiffsSummaryCounts,
  pluralize,
} from "./test-run-diffs.utils";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  includeReplayIds: boolean;
  includeMismatchFraction: boolean;
  includeReviews: boolean;
  includeReviewDecisions: boolean;
  includeDomDiffIds: boolean;
  includeAllDiffs: boolean;
  onlyUnreviewed: boolean;
  onlyRejected: boolean;
  onlyWithComments: boolean;
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
  includeMismatchFraction,
  includeReviews,
  includeReviewDecisions,
  includeDomDiffIds,
  includeAllDiffs,
  onlyUnreviewed,
  onlyRejected,
  onlyWithComments,
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
        [includeMismatchFraction, "--includeMismatchFraction"],
        [includeDomDiffIds, "--includeDomDiffIds"],
        [includeAllDiffs, "--includeAllDiffs"],
        [orderByReplayDiffs, "--orderByReplayDiffs"],
        [includeReviews, "--includeReviews"],
        [includeReviewDecisions, "--includeReviewDecisions"],
        [onlyUnreviewed, "--onlyUnreviewed"],
        [onlyRejected, "--onlyRejected"],
        [onlyWithComments, "--onlyWithComments"],
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

  const includeReviewsResolved = includeReviews || includeReviewDecisions;

  const columns = {
    includeDomDiffIds,
    includeReplayIds,
    includeMismatchFraction,
    includeReviews: includeReviewsResolved,
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

  // A base run (Partial) exists to be compared against, not to be a change of
  // its own, so it has no diffs to list — and it never finishes on its own, so
  // waiting for it wouldn't help either.
  if (isTestRunPartial(finishedStatus)) {
    throw new CliUserError(
      `Test run ${resolvedTestRunId} is a base run other test runs compare against and consequently has no changes/diffs.`,
    );
  }
  // Fatal failures already threw while waiting.
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
    includeMismatchFraction,
    includeDomDiffIds,
    includeAllDiffs,
    orderByReplayDiffs,
    includeReviews: includeReviewsResolved,
    onlyUnreviewed,
    onlyRejected,
    onlyWithComments,
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
  while (response.status !== "complete") {
    if (response.status === "failed") {
      const reasonSuffix =
        response.reason != null ? ` (${response.reason})` : "";
      // Only `test-run-not-ready` is worth another attempt: the test run was
      // still going when the computation's own wait for it ran out, so it may
      // well have finished by the time this command is run again. Nothing is
      // still computing in the background either way — see
      // DiffsSummaryFailureReason.
      const advice =
        response.reason === "test-run-not-ready"
          ? `the test run hadn't finished in time. Run this command again in a minute or more to start a fresh attempt.`
          : `diffs are not available for it.`;
      logNotice(
        `Diffs summary computation failed${reasonSuffix} for test run ${resolvedTestRunId}; ${advice}`,
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

  if (json) {
    printJson(data);
  } else {
    // Always emit the TSV header so a zero-diff run is a header with no rows (the
    // same shape as the in-progress short-circuit above), never empty stdout.
    console.log(buildDiffsSummaryHeader(columns).join("\t"));
    for (const diff of data) {
      console.log(formatDiffRow(diff, columns).join("\t"));
    }
  }

  // Summaries on stderr regardless of --json (which only changes stdout).
  if (data.length === 0) {
    logNotice(
      `Test run ${resolvedTestRunId} does not have any diffs matching the query.`,
    );
    return;
  }

  const tEnd = performance.now();
  const elapsed = `${((tEnd - t0) / 1000).toFixed(1)}s`;
  logNotice(
    response.selectionApplied
      ? // The backend always reports numMatchingDiffs alongside selectionApplied.
        `Including ${data.length} representative screenshot ${pluralize(data.length, "diff")} out of ${response.numMatchingDiffs!} total (${elapsed})`
      : `${data.length} screenshot ${pluralize(data.length, "diff")} (${elapsed})`,
  );
};

export const testRunDiffsCommand: CommandModule<unknown, Options> = {
  command: "test-run-diffs",
  describe:
    "Get the list of screenshot diffs for a given test run (by default all diffs when there are at most five; above that, a selected representative subset in priority order). Outputs a priority-ordered TSV table with columns replayDiffId and screenshotName plus the requested additional columns. Pass --counts to print just the totals instead of the list.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      description:
        "The test run ID. When omitted, the run is looked up from --commitSha, or from the current git HEAD when that is also omitted.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: looks up the latest test run for the commit. Defaults to the current git HEAD when neither --testRunId nor --commitSha is given.",
    },
    project: {
      string: true,
      description:
        "The project to look up the commit for (id, 'org/proj', or simply 'proj'). One-off override, when omitted uses the user-configured default project. Cannot be combined with --testRunId, which already determines the project.",
      conflicts: "testRunId",
    },
    includeAllDiffs: {
      boolean: true,
      description:
        "Output all screenshot diffs instead of only the selected representative subset.",
      default: false,
    },
    onlyUnreviewed: {
      boolean: true,
      description:
        "Output only screenshot diffs still awaiting review (decision unreviewed). The --only* flags are additive: when several are set, diffs matching any of them are output, so combining them widens the output rather than narrowing it.",
      default: false,
    },
    onlyRejected: {
      boolean: true,
      description:
        "Output only rejected screenshot diffs. The --only* flags are additive: when several are set, diffs matching any of them are output, so combining them widens the output rather than narrowing it.",
      default: false,
    },
    onlyWithComments: {
      boolean: true,
      description:
        "Output only screenshot diffs with one or more open review comments. The --only* flags are additive: when several are set, diffs matching any of them are output, so combining them widens the output rather than narrowing it.",
      default: false,
    },
    includeReplayIds: {
      boolean: true,
      description:
        "Add baseReplayId and headReplayId columns with each diff's base and head replay IDs.",
      default: false,
    },
    includeMismatchFraction: {
      boolean: true,
      description:
        "Add a mismatchFraction column with the fraction of pixels that differ between the before and after screenshots.",
      default: false,
    },
    includeReviews: {
      boolean: true,
      description:
        "Add decision and openComments columns with the review decision and number of open review comments per diff.",
      default: false,
    },
    includeReviewDecisions: {
      boolean: true,
      description: "Deprecated alias for --includeReviews.",
      deprecated: "use --includeReviews instead",
      default: false,
    },
    includeDomDiffIds: {
      boolean: true,
      description:
        "Add a domDiffIds column with a comma-separated list of diff IDs, where each ID represents a distinct structural DOM change. This is used to determine the selected set and its priority order.",
      default: false,
    },
    orderByReplayDiffs: {
      boolean: true,
      description:
        "Order the list by replay diff (a replay diff's differences are consecutive) instead of the default global priority order.",
      default: false,
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "By default, if the test run is still in progress the command blocks until it finishes before fetching diffs. Pass this to instead report the in-progress run and exit immediately.",
    },
    counts: {
      boolean: true,
      description:
        "Get the aggregate diff counts for a given test run instead of the per-diff list: number of replays, number of differences, the review-decision breakdown (approved/ignored/rejected/unreviewed), and the number of differences with open review comments. Cannot be combined with the list/filter flags, only with --json.",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
