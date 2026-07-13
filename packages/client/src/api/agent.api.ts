import type { SessionContext, TestRunStatus } from "@alwaysmeticulous/api";
import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

// ---------------------------------------------------------------------------
// Diffs Summary types
// ---------------------------------------------------------------------------

/**
 * The review decision recorded for a difference on its PR. `unreviewed` means no
 * decision (or no PR); `accepted`/`rejected`/`ignored` are the explicit verdicts.
 */
export type DiffDecisionState =
  | "accepted"
  | "rejected"
  | "ignored"
  | "unreviewed";

export interface DiffsSummaryScreenshot {
  screenshotName: string;
  /**
   * Global 1-based rank across all differences. By default the selection-priority
   * order; with `orderByReplayDiffs` it's re-sequenced so a replay diff's
   * differences are consecutive.
   */
  index: number;
  outcome: string;
  userVisibleOutcome: string;
  mismatchFraction: number | null;
  /** Present only when `includeDomDiffIds` is set. */
  domDiffIds?: string;
  /**
   * Whether this screenshot is part of the selected representative subset.
   * Present only when `includeAllDiffs` is set — otherwise the response
   * already contains only selected screenshots.
   */
  isSelected?: boolean;
  /**
   * The review decision for this difference on its PR. Present only when
   * `includeReviewDecisions` is set. `unreviewed` when there's no decision or no PR.
   */
  decision?: DiffDecisionState;
}

export interface DiffsSummaryReplayDiff {
  replayDiffId: string;
  baseReplayId?: string;
  headReplayId?: string;
  screenshots: DiffsSummaryScreenshot[];
}

export interface DiffsSummaryOptions {
  includeReplayIds?: boolean;
  /** Include the `domDiffIds` field on each screenshot. Default false. */
  includeDomDiffIds?: boolean;
  /**
   * Return every diff rather than only the pre-selected representative subset.
   * When true, `isSelected` marks which screenshots are in the selected subset.
   */
  includeAllDiffs?: boolean;
  /**
   * Assign the global `index` in replay-diff-grouped order (a replay diff's
   * differences get consecutive indices) instead of priority order.
   */
  orderByReplayDiffs?: boolean;
  /**
   * Include the `decision` field (the PR review decision) on each screenshot.
   * Default false. Resolved against the test run's PR at request time.
   */
  includeReviewDecisions?: boolean;
  /**
   * Return only the differences still awaiting review (decision `unreviewed`),
   * across every difference rather than just the selected representative subset —
   * i.e. everything a reviewer still has to act on. Default false.
   */
  onlyUnreviewed?: boolean;
  /**
   * Request a fresh computation when the previous attempt failed. A normal poll
   * returns `status: "failed"` without restarting; pass this to start a clean
   * run over the failed one. Off by default. A no-op if no computation has ever
   * been triggered for this test run — that case already starts one regardless.
   */
  retrigger?: boolean;
}

/**
 * Aggregate counts for a test run's diffs, computed live from the backend (no
 * diffs-summary computation needed). The decision buckets partition the
 * deduplicated differences: `numApproved + numIgnored + numRejected +
 * numUnreviewed === numDiffs`.
 */
export interface DiffsSummaryCountsResponse {
  /** Executed replay comparisons (excludes RSE-skipped / carried-forward and hidden). */
  numReplays: number;
  /** Deduplicated user-visible differences (one per `effectiveDiffHash`). */
  numDiffs: number;
  numApproved: number;
  numIgnored: number;
  numRejected: number;
  numUnreviewed: number;
}

/** The terminal Temporal workflow status that produced a `failed` response. */
export type DiffsSummaryFailureReason =
  | "FAILED"
  | "TIMED_OUT"
  | "TERMINATED"
  | "CANCELLED";

export interface DiffsSummaryResponse {
  /**
   * `pending` / `processing` — poll again; `complete` — `data` is populated;
   * `failed` — the last computation failed and left no result (poll again with
   * `retrigger` to try a fresh run).
   */
  status: "pending" | "processing" | "complete" | "failed";
  data?: DiffsSummaryReplayDiff[];
  /** Present only when `status` is `failed`. */
  reason?: DiffsSummaryFailureReason;
}

/**
 * The agent diffs-summary API contract version this client speaks. Sent on
 * every request so the backend can apply version-appropriate defaults; older
 * backends ignore it. Bump when the client adopts a new default contract.
 *
 * - v1 (no clientVersion sent): behaves as if `--includeDomDiffIds` and
 *   `--includeAllDiffs` were always on — the full set of diffs including
 *   `domDiffIds`. This is the implicit behaviour for pre-versioning clients.
 * - v2: introduces `--includeDomDiffIds` / `--includeAllDiffs` as opt-in flags
 *   (default off), so the response defaults to the curated selected subset
 *   with `domDiffIds` omitted.
 */
export const DIFFS_SUMMARY_CLIENT_VERSION = 2;

// ---------------------------------------------------------------------------
// Screenshot DOM Diff types
// ---------------------------------------------------------------------------

export interface ScreenshotDomDiffResponse {
  diffs: Array<{ index: number; content: string }>;
  totalDiffs: number;
}

// ---------------------------------------------------------------------------
// Screenshot JS coverage types
// ---------------------------------------------------------------------------

export type CompactRange = [startLineInc: number, endLineInc: number];
export type FileWithCompactRanges = [filePath: string, ranges: CompactRange[]];

export interface TestRunForCommitResponse {
  /**
   * The id of the most recent user-visible test run for the commit, including
   * one still in progress (`ExecutionError`/`Aborted` runs are skipped), or
   * `null` if the project has no such run.
   */
  testRunId: string | null;
  /**
   * The matched run's status (`null` iff `testRunId` is null). An in-progress
   * status lets the caller decide whether to wait for the run to finish.
   */
  status: TestRunStatus | null;
}

export interface TestRunJsCoverageResponse {
  /**
   * Executed line ranges per file across the whole test run, keyed by
   * repo-relative path (from the precomputed, repo-mapped coverage.json).
   */
  files: FileWithCompactRanges[];
}

/**
 * The agent test-run js-coverage API contract version this client speaks. Sent
 * on every request so the backend knows to serve the V2 per-file response
 * ({@link TestRunJsCoverageResponseV2}); older backends that don't
 * understand it fall back to the legacy {@link TestRunJsCoverageResponse}, and
 * pre-versioning clients (which send nothing) still get the legacy shape.
 *
 * - v1 (no clientVersion sent): legacy `files: [path, executedRanges][]`,
 *   including files with no executed coverage.
 * - v2: per-file objects carrying only the requested columns
 *   (executed/executable/uncovered ranges, coverage percentage), files with no
 *   value in any requested column dropped unless `includeAllFiles`, plus
 *   `prDiffOnly`/`globFilter`. At least one column must be requested.
 */
export const TESTRUN_JS_COVERAGE_CLIENT_VERSION = 2;

/** Which columns/rows the V2 test-run coverage response should carry. */
export interface TestRunJsCoverageOptions {
  /**
   * Return every file regardless of the requested columns (otherwise a file is
   * dropped unless a requested column has a value for it).
   */
  includeAllFiles?: boolean;
  /** Keep only repo file paths matching this gitignore-style glob. */
  globFilter?: string;
  includeExecutedRanges?: boolean;
  includeExecutableRanges?: boolean;
  includeUncoveredRanges?: boolean;
  includeCoveragePercentage?: boolean;
  /** Scope coverage to the PR diff (coverage.pr.json) instead of the whole run. */
  prDiffOnly?: boolean;
  /**
   * Additional test run IDs whose coverage is unioned with `testRunId`'s —
   * e.g. to show a run's normal coverage plus the coverage of a few extra
   * runs. Must belong to the same project as `testRunId`.
   */
  unionTestRunIds?: string[];
}

/**
 * A per-file row in the V2 test-run coverage response. `repoFilePath` is
 * always present; each other field is included only when the caller opted into
 * it, in this declaration order. Ranges are repo-relative and normalized.
 */
export interface TestRunCoverageFile {
  repoFilePath: string;
  executedRanges?: CompactRange[];
  /** Statically-executable lines unioned with executed lines (executed ⊆ executable). */
  executableRanges?: CompactRange[];
  /** executable − executed. */
  uncoveredRanges?: CompactRange[];
  /** `100 × |executed| / |executable|`, in 0–100; `null` when no executable lines. */
  coveragePercentage?: number | null;
}

export interface TestRunJsCoverageResponseV2 {
  files: TestRunCoverageFile[];
}

export interface ReplayJsCoverageResponse {
  /**
   * Executed line ranges for a single replay (whole replay, or one screenshot),
   * keyed by repo-relative path. Source-map paths that don't resolve to a repo
   * file are dropped. `null` only when a specific screenshot has no coverage.
   */
  files: FileWithCompactRanges[] | null;
}

export interface CoverageFileDiff {
  /** Repo-relative file path. */
  filePath: string;
  status: "added" | "removed" | "modified";
  baseRanges: CompactRange[];
  headRanges: CompactRange[];
}

export interface ReplayDiffJsCoverageDiffResponse {
  /**
   * Base/head executed line ranges and their diff, all keyed by repo-relative
   * path. Source-map paths that don't resolve to a repo file (e.g. a file
   * deleted at head, or third-party code) are dropped.
   */
  base: FileWithCompactRanges[] | null;
  head: FileWithCompactRanges[] | null;
  /**
   * Per-file coverage diff, computed over base/head *before* empty rows are
   * dropped, whereas the returned `base`/`head` arrays drop files with no
   * executed ranges unless `includeAllFiles`. So a `diff` entry can reference a
   * file absent from `base`/`head` (e.g. a file executed only on head is
   * `added` in `diff` but its empty base row is dropped from `base`); don't
   * assume every `diff.filePath` is present in both arrays.
   */
  diff: CoverageFileDiff[];
}

// ---------------------------------------------------------------------------
// Screenshot URLs types
// ---------------------------------------------------------------------------

export interface ScreenshotUrlsResponse {
  outcome: string;
  screenshot?: string;
  before?: string;
  after?: string;
  diffImage?: string;
}

// ---------------------------------------------------------------------------
// Timeline Diff types
// ---------------------------------------------------------------------------

export interface TimelineDiffEntry {
  status: "identical" | "removed" | "added" | "changed";
  timeMs: number;
  eventKind: string;
  description: string;
  mismatchFraction?: number | null;
}

export interface TimelineDiffResponse {
  baseReplayId: string;
  headReplayId: string;
  entries: TimelineDiffEntry[];
}

// ---------------------------------------------------------------------------
// Structured session data types
// ---------------------------------------------------------------------------

export interface StructuredSessionSummary {
  sessionId: string;
  startUrl: string;
  viewport?: { width: number; height: number };
  eventCount: number;
  totalDurationMs: number;
  networkRequestCount: number;
  pageNavigations: string[];
}

export interface StructuredUserEvent {
  index: number;
  type: string;
  selector: string;
  timestampMs: number;
  coordinates?: { x: number; y: number };
}

export interface NetworkRequestSummaryEntry {
  order: number;
  method: string;
  url: string;
  status: number;
  contentType: string | null;
  timeMs: number;
}

export interface NetworkRequestEntry {
  order: number;
  startedDateTime: string;
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: { mimeType: string; text?: string };
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
    content: { mimeType: string; text?: string; encoding?: string };
  };
  timeMs: number;
}

export interface SessionStorageSnapshot {
  cookies: Array<{
    name: string;
    domain: string | null;
    path?: string;
    sameSite?: string;
    secure?: boolean;
    httpOnly?: boolean;
  }>;
  localStorage: Array<{ key: string; value: string }>;
  sessionStorage?: Array<{ key: string; value: string }>;
  indexedDb?: Array<{
    databaseName: string;
    objectStoreName: string;
    entryCount: number;
  }>;
}

export interface UrlHistoryEntry {
  timestampMs: number;
  url: string;
  urlPattern?: string;
}

export interface WebSocketSummaryEntry {
  connectionId: number;
  url: string;
  eventCount: number;
}

export interface StructuredSessionDataResponse {
  summary: StructuredSessionSummary;
  userEvents: StructuredUserEvent[];
  networkRequests: {
    summary: NetworkRequestSummaryEntry[];
    entries: NetworkRequestEntry[];
  };
  storage: SessionStorageSnapshot;
  urlHistory: UrlHistoryEntry[];
  context: SessionContext | null;
  webSockets?: {
    summary: WebSocketSummaryEntry[];
    connections: Array<{
      connectionId: number;
      url: string;
      events: unknown[];
    }>;
  };
}

// ---------------------------------------------------------------------------
// Telemetry types
// ---------------------------------------------------------------------------

export type AgentFeature = "debug-replay-diff" | "debug-replay";

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const trackAgentFeatureUsage = async ({
  client,
  feature,
  project,
}: {
  client: MeticulousClient;
  feature: AgentFeature;
  project: string | undefined;
}): Promise<void> => {
  await client
    .post(
      "agent/telemetry",
      { feature },
      project ? { params: { project } } : undefined,
    )
    .catch(() => {
      // Telemetry is best-effort — never fail the command
    });
};

export const getTestRunDiffsSummary = async (
  client: MeticulousClient,
  testRunId: string,
  options?: DiffsSummaryOptions,
): Promise<DiffsSummaryResponse> => {
  const params: Record<string, string> = {
    clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
  };
  if (options?.includeReplayIds) {
    params.includeReplayIds = "true";
  }
  if (options?.includeDomDiffIds) {
    params.includeDomDiffIds = "true";
  }
  if (options?.includeAllDiffs) {
    params.includeAllDiffs = "true";
  }
  if (options?.orderByReplayDiffs) {
    params.orderByReplayDiffs = "true";
  }
  if (options?.includeReviewDecisions) {
    params.includeReviewDecisions = "true";
  }
  if (options?.onlyUnreviewed) {
    params.onlyUnreviewed = "true";
  }
  if (options?.retrigger) {
    params.retrigger = "true";
  }
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/diffs-summary`, { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

// Aggregate diff counts (replays, deduplicated differences, decision breakdown)
// for a test run. Computed live server-side, so unlike the diffs-summary it needs
// no polling and returns just the numbers rather than the full list.
export const getTestRunDiffsSummaryCounts = async (
  client: MeticulousClient,
  testRunId: string,
): Promise<DiffsSummaryCountsResponse> => {
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/diffs-summary/counts`)
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getScreenshotDomDiff = async (
  client: MeticulousClient,
  replayDiffId: string,
  screenshotName: string,
  index?: number,
  context?: string,
): Promise<ScreenshotDomDiffResponse> => {
  const params: Record<string, string> = {};
  if (index != null) {
    params.index = String(index);
  }
  if (context != null) {
    params.context = context;
  }
  const { data } = await client
    .get(
      `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/dom-diff`,
      { params },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

// Resolves the latest test run for a commit so the current checkout can be
// mapped to a test run (e.g. before requesting js-coverage). Returns
// `{ testRunId: null }` when the project has no matching run. The project
// comes from the token; OAuth user tokens may pass `project` to override
// which project this call targets, falling back to the caller's stored
// default project when omitted.
export const getTestRunForCommit = async (
  client: MeticulousClient,
  commitSha: string,
  options?: { project?: string | undefined },
): Promise<TestRunForCommitResponse> => {
  const params: Record<string, string> = { commitSha };
  if (options?.project != null) {
    params.project = options.project;
  }
  const { data } = await client
    .get("agent/test-runs", { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

// Returns the whole test run's coverage from the precomputed, repo-mapped
// coverage.json (keyed by repo-relative path). Sends `clientVersion` so the
// backend serves the V2 per-file response carrying the requested columns
// (executed/executable/uncovered ranges, coverage percentage), optionally
// scoped to the PR diff and/or filtered by a glob.
export const getTestRunJsCoverage = async (
  client: MeticulousClient,
  testRunId: string,
  options?: TestRunJsCoverageOptions,
): Promise<TestRunJsCoverageResponseV2> => {
  const params: Record<string, string> = {
    clientVersion: String(TESTRUN_JS_COVERAGE_CLIENT_VERSION),
  };
  // The V2 endpoint requires at least one column and 400s otherwise. Preserve
  // the historical default of executed ranges when the caller opts into no
  // column explicitly, so a bare `getTestRunJsCoverage(client, testRunId)`
  // keeps returning executed ranges rather than erroring.
  const includeExecutedRanges =
    options?.includeExecutedRanges ||
    !(
      options?.includeExecutableRanges ||
      options?.includeUncoveredRanges ||
      options?.includeCoveragePercentage
    );
  if (options?.includeAllFiles) {
    params.includeAllFiles = "true";
  }
  if (options?.globFilter != null && options.globFilter !== "") {
    params.globFilter = options.globFilter;
  }
  if (includeExecutedRanges) {
    params.includeExecutedRanges = "true";
  }
  if (options?.includeExecutableRanges) {
    params.includeExecutableRanges = "true";
  }
  if (options?.includeUncoveredRanges) {
    params.includeUncoveredRanges = "true";
  }
  if (options?.includeCoveragePercentage) {
    params.includeCoveragePercentage = "true";
  }
  if (options?.prDiffOnly) {
    params.prDiffOnly = "true";
  }
  if (options?.unionTestRunIds != null && options.unionTestRunIds.length > 0) {
    params.unionTestRunIds = options.unionTestRunIds.join(",");
  }
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/js-coverage`, { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

// Plain coverage for a single replay. Omit screenshotName for the whole replay.
// Repo file paths always resolve against the run that executed the replay as its
// head (its source maps were built at that run's commit). testRunId, when given,
// gates membership (the replay must belong to that run, head or base) and
// disambiguates: if the replay was that run's head, paths resolve against it —
// useful when a head replay belongs to several runs (e.g. proxy / copied diffs).
// When omitted, the execution run is inferred from replay-diffs and must be
// unique (restricted to user-visible runs).
export const getReplayJsCoverage = async (
  client: MeticulousClient,
  replayId: string,
  // Selects *which* coverage to fetch (a single screenshot vs. the whole
  // replay), so it's a positional argument distinct from the `options` that
  // shape the response. Omit for the whole replay.
  screenshotName?: string,
  options?: {
    testRunId?: string | undefined;
    // Return every file; by default files with no executed ranges are dropped.
    includeAllFiles?: boolean | undefined;
    globFilter?: string | undefined;
  },
): Promise<ReplayJsCoverageResponse> => {
  const path =
    screenshotName != null
      ? `agent/replays/${replayId}/screenshots/${encodeURIComponent(screenshotName)}/js-coverage`
      : `agent/replays/${replayId}/js-coverage`;
  const params: Record<string, string> = {};
  if (options?.testRunId != null) {
    params.testRunId = options.testRunId;
  }
  if (options?.includeAllFiles) {
    params.includeAllFiles = "true";
  }
  if (options?.globFilter != null && options.globFilter !== "") {
    params.globFilter = options.globFilter;
  }
  const { data } = await client.get(path, { params }).catch((error) => {
    throw maybeEnrichFetchError(error);
  });
  return data;
};

// Coverage *diff* for a replay diff (base vs head). `globFilter` scopes
// base/head/diff to matching repo paths; `includeAllFiles` keeps base/head rows
// with no executed ranges (dropped by default).
export const getReplayDiffJsCoverage = async (
  client: MeticulousClient,
  replayDiffId: string,
  // Selects *which* diff to fetch (a single screenshot vs. the whole replay),
  // so it's a positional argument distinct from the `options` that shape the
  // response. Omit for the whole-replay diff.
  screenshotName?: string,
  options?: {
    includeAllFiles?: boolean | undefined;
    globFilter?: string | undefined;
  },
): Promise<ReplayDiffJsCoverageDiffResponse> => {
  const path =
    screenshotName != null
      ? `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/js-coverage-diff`
      : `agent/replay-diffs/${replayDiffId}/js-coverage-diff`;
  const params: Record<string, string> = {};
  if (options?.includeAllFiles) {
    params.includeAllFiles = "true";
  }
  if (options?.globFilter != null && options.globFilter !== "") {
    params.globFilter = options.globFilter;
  }
  const { data } = await client.get(path, { params }).catch((error) => {
    throw maybeEnrichFetchError(error);
  });
  return data;
};

export const getScreenshotUrls = async (
  client: MeticulousClient,
  replayDiffId: string,
  screenshotName: string,
): Promise<ScreenshotUrlsResponse> => {
  const { data } = await client
    .get(
      `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/image-urls`,
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getTimelineDiff = async (
  client: MeticulousClient,
  replayDiffId: string,
): Promise<TimelineDiffResponse> => {
  const { data } = await client
    .get(`agent/replay-diffs/${replayDiffId}/timeline-diff`)
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getStructuredSessionData = async (
  client: MeticulousClient,
  sessionId: string,
): Promise<StructuredSessionDataResponse> => {
  const { data } = await client
    .get(`agent/sessions/${sessionId}/structured-data`)
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};
