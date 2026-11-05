import type {
  AgentSwarmCaseCounts,
  AgentSwarmRunStatus,
} from "@alwaysmeticulous/client";

/**
 * What each pr-backtester subagent writes to
 * `.meticulous-try/backtests/pr-<prNumber>.json`. Every id is optional: the
 * record is updated as each step finishes (null until then), and failures are
 * kept in `errors`.
 */
export interface BacktestRecord {
  prNumber: number;
  title?: string | null;
  baseSha: string;
  headSha: string;
  baseDeploymentId?: string | null;
  headDeploymentId?: string | null;
  baseTestRunId?: string | null;
  headTestRunId?: string | null;
  swarmRunId?: string | null;
  errors?: string[];
}

export interface TestRunSummary {
  id: string;
  commitSha: string;
  status: string;
  diffCount: number | null;
  url: string;
}

export interface SwarmFailingCase {
  caseIndex: number;
  title: string;
  summary: string | null;
  regressionCount: number;
}

export interface SwarmRunSummary {
  id: string;
  commitSha: string;
  status: AgentSwarmRunStatus;
  counts: Partial<AgentSwarmCaseCounts>;
  failingCases: SwarmFailingCase[];
  url: string;
}

export interface PrResult {
  prNumber: number;
  title: string;
  baseSha: string;
  headSha: string;
  bugSignals: string[];
  baseTestRun: TestRunSummary | null;
  headTestRun: TestRunSummary | null;
  swarmRun: SwarmRunSummary | null;
  errors: string[];
  pending: boolean;
  /** Higher = more compelling to show the user first. */
  findingsScore: number;
}

export interface TryResults {
  projectUrl: string | null;
  allDone: boolean;
  prs: PrResult[];
  /** Runs on commits that no backtest or candidate PR accounts for. */
  otherTestRuns: TestRunSummary[];
  otherSwarmRuns: SwarmRunSummary[];
}
