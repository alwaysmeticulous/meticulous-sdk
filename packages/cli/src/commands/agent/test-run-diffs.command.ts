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
  isTestRunInProgress,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";

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

const fmtMismatch = (v: number | null): string =>
  v != null ? v.toFixed(5) : "";

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

  // Diffs are only meaningful once the run has finished. If it is still running
  // and the caller didn't opt to wait, report it and stop — regardless of how
  // the run was selected.
  if (isTestRunInProgress(status) && !waitForTestRunToComplete) {
    log(
      `Test run ${resolvedTestRunId} is still in progress (status: ${status}); ` +
        "pass --waitForTestRunToComplete to block until it finishes and then show diffs.",
    );
    return;
  }

  if (waitForTestRunToComplete) {
    await awaitTestRunCompletion(client, resolvedTestRunId);
  }

  const t0 = performance.now();

  log(`Fetching diffs summary for test run ${resolvedTestRunId}...`);

  // --includeMatches implies --includeAllDiffs (matches are never part of the
  // selected subset, so they only make sense alongside the full set). Use the
  // effective value for both the request and the isSelected column.
  const allDiffs = includeAllDiffs || includeMatches;

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

  // Poll until complete
  while (response.status === "pending" || response.status === "processing") {
    if (verbose) log(`Status: ${response.status}`);
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

  // Flatten into one list of (replayDiff, screenshot) rows. The backend sets
  // `index` to the priority rank by default, or the within-replay position
  // (with `total`) when orderByReplayDiffs is set.
  const rows = data.flatMap((rd) => rd.screenshots.map((s) => ({ rd, s })));

  // With --orderByReplayDiffs the backend already returns rows grouped by
  // replay diff in event order, so we keep that order. Otherwise sort by the
  // priority index (a flat cross-replay-diff order the grouped response can't
  // express).
  if (!orderByReplayDiffs) {
    rows.sort((a, b) => a.s.index - b.s.index);
  }

  // Print TSV header. index/total are only meaningful with orderByReplayDiffs;
  // by default rows are already in priority order, so the index is omitted.
  const headerFields = ["replayDiffId", "screenshotName"];
  if (orderByReplayDiffs) headerFields.push("index", "total");
  headerFields.push("outcome", "mismatch");
  if (includeDomDiffIds) headerFields.push("domDiffIds");
  if (allDiffs) headerFields.push("isSelected");
  if (includeReplayIds) headerFields.push("baseReplayId", "headReplayId");
  console.log(headerFields.join("\t"));

  let totalDiffScreenshots = 0;

  for (const { rd, s } of rows) {
    if (s.userVisibleOutcome === "difference") {
      totalDiffScreenshots++;
    }
    const fields: (string | number)[] = [rd.replayDiffId, s.screenshotName];
    if (orderByReplayDiffs) fields.push(s.index, s.total ?? "");
    fields.push(s.outcome, fmtMismatch(s.mismatchFraction));
    if (includeDomDiffIds) fields.push(s.domDiffIds ?? "");
    if (allDiffs) fields.push(String(s.isSelected ?? false));
    if (includeReplayIds)
      fields.push(rd.baseReplayId ?? "", rd.headReplayId ?? "");
    console.log(fields.join("\t"));
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
