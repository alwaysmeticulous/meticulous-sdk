import type { TestRunStatus } from "@alwaysmeticulous/api";
import type { AgentResponseNotes } from "./agent.api";

/**
 * One row of the test-run listing. Mirrors webapp-backend's
 * `AgentTestRunListItem` (agent-test-runs.types.ts). Optional attributes are
 * omitted rather than `null` when absent.
 */
export interface TestRunListItem {
  id: string;
  createdAt: string;
  status: TestRunStatus;
  commitSha: string;
  /**
   * Absent for a base test run, which isn't associated with a PR, and for a
   * caller who may not see the project's PR data.
   */
  prNumber?: string;
  /** Absent when the run had nothing to compare against. */
  baseTestRunId?: string;
  /**
   * The "N differences" headline the web app shows. Only for a run in status
   * `Success` or `Failure`.
   */
  diffCount?: number;
  /**
   * How many of the run's builtin checks warned without needing
   * acknowledgement. Only for a run whose builtin checks completed.
   */
  checkWarningCount?: number;
  /**
   * How many of the run's builtin checks need acknowledgement, whether or not
   * it has since been given. Only for a run whose builtin checks completed.
   */
  checkFailureCount?: number;
  /**
   * Seconds spent running — for a merged session-repair run, the sum over the
   * original run and the patched re-run it was merged from. Absent when that
   * wasn't recorded.
   */
  durationSeconds?: number;
}

export interface TestRunsResponse {
  testRuns: TestRunListItem[];
  notes?: AgentResponseNotes;
}

export interface GetTestRunsOptions {
  project?: string | undefined;
  prNumber?: string | undefined;
  /** List the runs that aren't associated with a PR instead of the PR runs. */
  baseTestRuns?: boolean | undefined;
  /**
   * Keep only each PR's newest run, as the web app's test-runs tab does. Not
   * with `baseTestRuns`; the server rejects it otherwise.
   */
  latestPerPullRequest?: boolean | undefined;
  /** Comma-separated test run statuses. */
  status?: string | undefined;
  /** Only runs in status `Failure`. Not with `status`; the server rejects it otherwise. */
  withDiffsOnly?: boolean | undefined;
  /** Not with `baseTestRuns`; the server rejects it otherwise. */
  withCheckIssuesOnly?: boolean | undefined;
  /** Comma-separated builtin check ids. Only with `withCheckIssuesOnly`. */
  checkIds?: string | undefined;
  createdSince?: string | undefined;
  createdUntil?: string | undefined;
  /** Not with `baseTestRuns`; the server rejects it otherwise. */
  includeBaseTestRunId?: boolean | undefined;
  /** Not with `baseTestRuns`; the server rejects it otherwise. */
  includeDiffCount?: boolean | undefined;
  /** Not with `baseTestRuns`; the server rejects it otherwise. */
  includeDurationSeconds?: boolean | undefined;
  /** Not with `baseTestRuns`; the server rejects it otherwise. */
  includeCheckIssueCounts?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}
