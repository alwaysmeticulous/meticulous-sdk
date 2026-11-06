import type { CandidatePr } from "../candidate-prs/types";
import type {
  BacktestRecord,
  PrResult,
  SwarmRunSummary,
  TestRunSummary,
  TryResults,
} from "./types";

const TERMINAL_TEST_RUN_STATUSES = new Set([
  "Success",
  "Failure",
  "Aborted",
  "Skipped",
  "ExecutionError",
]);
const TERMINAL_SWARM_STATUSES = new Set([
  "succeeded",
  "failed",
  "timedOut",
  "cancelled",
]);

/**
 * Joins what the backtesters recorded (and the ranked candidates, for PRs
 * whose record is missing) with the project's runs, one row per PR, most
 * compelling findings first.
 */
export const aggregateResults = (options: {
  projectUrl: string | null;
  backtests: BacktestRecord[];
  candidates: CandidatePr[];
  testRuns: TestRunSummary[];
  swarmRuns: SwarmRunSummary[];
}): TryResults => {
  const { backtests, candidates, testRuns, swarmRuns } = options;
  const candidatesByPr = new Map(
    candidates.map((candidate) => [candidate.prNumber, candidate]),
  );
  const records = mergeRecords(backtests, candidates);

  const prs = records
    .map((record) =>
      buildPrResult(record, candidatesByPr.get(record.prNumber), {
        testRuns,
        swarmRuns,
      }),
    )
    .filter(
      (pr) =>
        pr.headTestRun || pr.swarmRun || pr.baseTestRun || pr.errors.length > 0,
    )
    .sort(
      (a, b) => b.findingsScore - a.findingsScore || b.prNumber - a.prNumber,
    );

  const claimedTestRuns = new Set(
    prs.flatMap((pr) => [pr.baseTestRun?.id, pr.headTestRun?.id]),
  );
  const claimedSwarmRuns = new Set(prs.map((pr) => pr.swarmRun?.id));

  return {
    projectUrl: options.projectUrl,
    allDone: prs.every((pr) => !pr.pending),
    prs,
    otherTestRuns: testRuns.filter((run) => !claimedTestRuns.has(run.id)),
    otherSwarmRuns: swarmRuns.filter((run) => !claimedSwarmRuns.has(run.id)),
  };
};

/** Backtest records win; candidates only fill in PRs nobody recorded. */
const mergeRecords = (
  backtests: BacktestRecord[],
  candidates: CandidatePr[],
): BacktestRecord[] => {
  const recorded = new Set(backtests.map((record) => record.prNumber));
  return [
    ...backtests,
    ...candidates
      .filter((candidate) => !recorded.has(candidate.prNumber))
      .map((candidate) => ({
        prNumber: candidate.prNumber,
        title: candidate.title,
        baseSha: candidate.baseSha,
        headSha: candidate.headSha,
      })),
  ];
};

const buildPrResult = (
  record: BacktestRecord,
  candidate: CandidatePr | undefined,
  runs: { testRuns: TestRunSummary[]; swarmRuns: SwarmRunSummary[] },
): PrResult => {
  const headTestRun = pickRun(
    runs.testRuns,
    record.headTestRunId,
    record.headSha,
  );
  const baseTestRun = pickRun(
    runs.testRuns,
    record.baseTestRunId,
    record.baseSha,
  );
  const swarmRun = pickRun(runs.swarmRuns, record.swarmRunId, record.headSha);
  const bugSignals = describeBugSignals(candidate);

  const pending =
    (headTestRun != null &&
      !TERMINAL_TEST_RUN_STATUSES.has(headTestRun.status)) ||
    (swarmRun != null && !TERMINAL_SWARM_STATUSES.has(swarmRun.status)) ||
    (record.headTestRunId != null && headTestRun == null) ||
    (record.swarmRunId != null && swarmRun == null);

  const runUrl = headTestRun?.url ?? swarmRun?.url ?? null;

  return {
    prNumber: record.prNumber,
    title: record.title ?? candidate?.title ?? "",
    baseSha: record.baseSha,
    headSha: record.headSha,
    runUrl,
    failingCases: (swarmRun?.failingCases ?? []).map((testCase) => ({
      ...testCase,
      url: swarmCaseUrl({
        runUrl: runUrl ?? "",
        onTestRunPage: headTestRun != null,
        caseIndex: testCase.caseIndex,
      }),
    })),
    bugSignals,
    baseTestRun,
    headTestRun,
    swarmRun,
    errors: record.errors ?? [],
    pending,
    findingsScore: scoreFindings({ headTestRun, swarmRun, bugSignals }),
  };
};

/**
 * The test run page shows the swarm under its Agent swarm tab; a swarm run
 * without a head test run has its own page. Both select a case with `case`.
 */
const swarmCaseUrl = (options: {
  runUrl: string;
  onTestRunPage: boolean;
  caseIndex: number;
}): string => {
  const caseParam = `case=${encodeURIComponent(toSwarmCaseId(options.caseIndex))}`;
  return options.onTestRunPage
    ? `${options.runUrl}?tab=agent-swarm&${caseParam}`
    : `${options.runUrl}?${caseParam}`;
};

/** Matches the web app's case ids (`toAgentSwarmCaseId`). */
const toSwarmCaseId = (caseIndex: number): string => `case-${caseIndex}`;

/** By recorded id when there is one, else the newest run on that commit. */
const pickRun = <T extends { id: string; commitSha: string }>(
  runs: T[],
  id: string | null | undefined,
  commitSha: string,
): T | null => {
  if (id) {
    return runs.find((run) => run.id === id) ?? null;
  }
  return runs.find((run) => run.commitSha === commitSha) ?? null;
};

const describeBugSignals = (candidate: CandidatePr | undefined): string[] => {
  if (!candidate) {
    return [];
  }
  const { revertedBy, followUpFixes } = candidate.signals;
  return [
    ...(revertedBy
      ? [`reverted ${revertedBy.daysAfter}d later: ${revertedBy.subject}`]
      : []),
    ...followUpFixes.map(
      (fix) => `follow-up fix +${fix.daysAfter}d: ${fix.subject}`,
    ),
  ];
};

const scoreFindings = (options: {
  headTestRun: TestRunSummary | null;
  swarmRun: SwarmRunSummary | null;
  bugSignals: string[];
}): number => {
  const failingCases = options.swarmRun?.failingCases.length ?? 0;
  const regressions =
    options.swarmRun?.failingCases.reduce(
      (total, testCase) => total + testCase.regressionCount,
      0,
    ) ?? 0;
  const diffs = Math.min(options.headTestRun?.diffCount ?? 0, 20);
  const caughtSomething = failingCases > 0 || diffs > 0;
  return (
    failingCases * 20 +
    regressions * 10 +
    diffs * 2 +
    (caughtSomething && options.bugSignals.length > 0 ? 50 : 0)
  );
};
