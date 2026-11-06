import type { PrResult, SwarmRunSummary, TryResults } from "./types";

export const formatResults = (results: TryResults): string[] => {
  if (results.prs.length === 0) {
    return [
      "No backtest results yet: no recorded backtests or runs on candidate PR commits.",
    ];
  }
  return [
    results.allDone
      ? "All backtests finished."
      : "Some backtests are still running (re-run with --waitSeconds to wait).",
    ...results.prs.flatMap(formatPr),
  ];
};

const formatPr = (pr: PrResult): string[] => [
  "",
  `#${pr.prNumber} ${pr.title}${pr.pending ? " (running)" : ""}`,
  ...pr.bugSignals.map((signal) => `  history: ${signal}`),
  `  run: ${pr.runUrl ?? "no run found"}`,
  pr.headTestRun
    ? `  replay: ${pr.headTestRun.status}, ${pr.headTestRun.diffCount ?? "?"} diff(s)`
    : "  replay: no head test run found",
  pr.swarmRun
    ? `  agent swarm: ${pr.swarmRun.status}, ${formatCounts(pr.swarmRun.counts)}`
    : "  agent swarm: no run found",
  ...pr.failingCases.map(
    (testCase) =>
      `    FAIL [case ${testCase.caseIndex}] ${testCase.title}${testCase.summary ? `: ${testCase.summary}` : ""} — ${testCase.url}`,
  ),
  ...pr.errors.map((error) => `  error: ${error}`),
];

const formatCounts = (counts: SwarmRunSummary["counts"]): string =>
  counts.total == null
    ? "counts pending"
    : `${counts.pass ?? 0} pass / ${counts.fail ?? 0} fail / ${counts.blocked ?? 0} blocked of ${counts.total}`;
