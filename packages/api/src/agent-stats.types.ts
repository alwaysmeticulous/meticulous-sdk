export interface BulkStatsPagination {
  limit: number;
  offset: number;
  totalCount: number;
  nextOffset: number | null;
}

export interface TestRunStatsApprover {
  email: string;
  firstName: string;
  lastName: string;
}

export interface TestRunStatsItem {
  testRunId: string;
  baseCommitSha: string | null;
  headCommitSha: string;
  executionSha: string | null;
  prNumber: string | null;
  prAuthor: string | null;
  prAuthorBitbucketAccountId: string | null;
  prCoveragePercentage: number | null;
  /**
   * Normalized PR outcome from the hosting-provider status: `merged`,
   * `rejected` (closed / declined without merging), or `open`. Null when the
   * caller cannot read PR identity.
   */
  prStatus: "merged" | "rejected" | "open" | null;
  sessionsReplayedCount: number;
  diffCount: number;
  diffApprovedCount: number;
  diffRejectedCount: number;
  diffIgnoredCount: number;
  diffCountChangeFromPreviousCommit: number | null;
  diffApprovers: TestRunStatsApprover[] | null;
  userViewCount: number;
  /** User-submitted diff reports attached to this test run, of any report type. */
  userDiffReportCount: number;
  meticulousCommentPostedOnPr: boolean | null;
  runTimestamp: string;
}

export interface TestRunStatsResponse {
  data: TestRunStatsItem[];
  pagination: BulkStatsPagination;
  /**
   * Backend-written remarks about this response, e.g. which page these rows
   * are. Additive and optional: a client too old to know the field ignores it.
   */
  notes?: string[];
}

export const TEST_RUN_EVENT_TYPES = [
  "test_run_completed",
  "test_run_comment_posted",
  "test_run_viewed",
  "diff_approved",
  "diff_ignored",
  "diff_rejected",
  "user_diff_reported",
] as const;

export type TestRunEventType = (typeof TEST_RUN_EVENT_TYPES)[number];

/**
 * Mirror of the backend's `UserDiffReportType`. Restated here because
 * `database-entities` is a private package this one cannot depend on; the
 * backend pins the two together with a compile-time assertion.
 */
export type TestRunEventDiffReportType =
  | "flake"
  | "unrelated_to_code_change"
  | "bug_or_unintended"
  | "outdated_network_response";

export interface TestRunEventActor {
  email: string;
  firstName: string;
  lastName: string;
}

export interface TestRunEventStatsItem {
  eventType: TestRunEventType;
  timestamp: string;
  testRunId: string | null;
  /** Current test-run stats snapshot, populated only for `test_run_completed`. */
  testRun: TestRunStatsItem | null;
  prNumber: string | null;
  prAuthor: string | null;
  prAuthorBitbucketAccountId: string | null;
  actor: TestRunEventActor | null;
  diffReportType: TestRunEventDiffReportType | null;
  diffHash: string | null;
}

export interface TestRunEventStatsPagination {
  limit: number;
  offset: number;
  totalCount: number | null;
  nextOffset: number | null;
  nextCursor: string | null;
}

export interface TestRunEventStatsResponse {
  data: TestRunEventStatsItem[];
  pagination: TestRunEventStatsPagination;
  /** See {@link TestRunStatsResponse.notes}. */
  notes?: string[];
}

export interface ProjectDailyRunTimeStats {
  mean: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

/**
 * Daily PR engagement counts, split by whether the PR was merged or closed
 * without merging (`rejected`). Approved / resolved use the last completed
 * test run before merge. Nulls mean the daily row was computed before that
 * field existed.
 */
export interface ProjectDailyPrStats {
  /** Merged PRs that had screenshot diffs on a visible test run. */
  mergedWithDiffs: number;
  /** Merged PRs where a test run with diffs was viewed. */
  mergedWithDiffsViewed: number;
  /**
   * Merged PRs whose last completed pre-merge test run had diffs, all
   * accepted or ignored before merge.
   */
  mergedApproved: number | null;
  /**
   * Merged PRs where a viewed pre-merge run had diffs and the last completed
   * pre-merge run had none.
   */
  mergedResolved: number | null;
  /** PRs closed without merging that had screenshot diffs. */
  rejectedWithDiffs: number | null;
  /** PRs closed without merging where a test run with diffs was viewed. */
  rejectedWithDiffsViewed: number | null;
}

/**
 * Keyed by the backend's `BugPreventionCategory`, restated for the same reason
 * as {@link TestRunEventDiffReportType} and pinned by the same assertion.
 */
export type PrNumbersByBugPreventionCategory = Record<
  "diff_rejected" | "diff_eliminated" | "diff_changed_and_approved",
  string[]
>;

export interface ProjectDailyStatsItem {
  startDatetime: string;
  endDatetime: string;
  testRunCount: number;
  runTimeSeconds: ProjectDailyRunTimeStats;
  prRunTimeSeconds: ProjectDailyRunTimeStats;
  coverage: number | null;
  prs: ProjectDailyPrStats;
  bugsPrevented: {
    total: number;
    high: number | null;
    medium: number | null;
    lower: number | null;
  };
  prNumbersWithPotentialBugs: PrNumbersByBugPreventionCategory | null;
}

export interface ProjectDailyStatsResponse {
  data: ProjectDailyStatsItem[];
  pagination: BulkStatsPagination;
  /** See {@link TestRunStatsResponse.notes}. */
  notes?: string[];
}
