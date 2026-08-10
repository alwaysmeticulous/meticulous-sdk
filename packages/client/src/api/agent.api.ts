import type { SessionContext, TestRunStatus } from "@alwaysmeticulous/api";
import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient, Response } from "../types/client.types";

// ---------------------------------------------------------------------------
// Non-visual check report types
// ---------------------------------------------------------------------------

export type TestRunCheckType = "custom" | "builtin";

export interface TestRunCheckReport {
  text: string;
}

/**
 * On a `custom` check, the customer's own reported error text; on a
 * `builtin` check, a classified code (`execution-error`, `computation-error`,
 * or a raw Temporal terminal status) rather than internal error text.
 */
export type TestRunCheckReportResponse =
  | { status: "processing" }
  | { status: "failed"; reason: string }
  | ({ status: "complete" } & TestRunCheckReport);

export const getTestRunCheckReport = async (
  client: MeticulousClient,
  testRunId: string,
  checkId: string,
  options: { checkType?: TestRunCheckType } = {},
): Promise<TestRunCheckReportResponse> => {
  const params: Record<string, string> = {};
  if (options.checkType != null && options.checkType !== "builtin") {
    params.checkType = options.checkType;
  }
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/checks/${encodeURIComponent(checkId)}`, {
      params,
    })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

// ---------------------------------------------------------------------------
// Diffs Summary types
// ---------------------------------------------------------------------------

/**
 * The review decision for a difference.
 *
 * An agent can only ever produce `rejected`, and it is the same `rejected` a
 * human produces — it blocks the pull request identically. Nothing here says who
 * decided; read `isAgentAuthored` on the decision for that.
 */
export type DiffDecisionState =
  | "accepted"
  | "ignored"
  | "rejected"
  | "unreviewed";

/**
 * @deprecated Legacy v1/v2 nested response shape. v3 returns a flat list of
 * {@link DiffsSummaryDiff} entries.
 */
export interface DiffsSummaryScreenshot {
  screenshotName: string;
  /**
   * Global 1-based rank across all differences. By default the selection-priority
   * order; with `orderByReplayDiffs` it's re-sequenced so a replay diff's
   * differences are consecutive.
   *
   * @deprecated Present only in v1/v2 responses. In v3, array order conveys
   * priority.
   */
  index: number;
  /**
   * @deprecated Present only in v1/v2 responses. Every v3 entry is a difference.
   */
  outcome: string;
  userVisibleOutcome: string;
  mismatchFraction: number | null;
  /** Present only when `includeDomDiffIds` is set. */
  domDiffIds?: string;
  /**
   * Whether this screenshot is part of the selected representative subset in
   * legacy nested responses. Current responses use `selectionApplied` metadata.
   */
  isSelected?: boolean;
  /** The review decision for this difference. Present with `includeReviews`. */
  decision?: DiffDecisionState;
  /** Number of open review comments. Present with `includeReviews`. */
  openComments?: number;
}

/**
 * @deprecated Legacy v1/v2 nested response shape. v3 returns a flat list of
 * {@link DiffsSummaryDiff} entries.
 */
export interface DiffsSummaryReplayDiff {
  replayDiffId: string;
  baseReplayId?: string;
  headReplayId?: string;
  screenshots: DiffsSummaryScreenshot[];
}

/** A screenshot difference in the order it should be reviewed. */
export interface DiffsSummaryDiff {
  replayDiffId: string;
  screenshotName: string;
  /** Present only when `includeMismatchFraction` is set. */
  mismatchFraction?: number;
  /** Present only when `includeDomDiffIds` is set. */
  domDiffIds?: string;
  /** Present only when `includeReviews` is set. */
  decision?: DiffDecisionState;
  /** Number of open review comments. Present with `includeReviews`. */
  openComments?: number;
  /** Present only when `includeReplayIds` is set. */
  baseReplayId?: string;
  /** Present only when `includeReplayIds` is set. */
  headReplayId?: string;
}

export interface DiffsSummaryOptions {
  includeReplayIds?: boolean;
  /** Include the fraction of screenshot pixels that differ. Default false. */
  includeMismatchFraction?: boolean;
  /** Include the `domDiffIds` field on each screenshot. Default false. */
  includeDomDiffIds?: boolean;
  /**
   * Return all screenshot diffs instead of only the selected representative
   * subset.
   */
  includeAllDiffs?: boolean;
  /**
   * Order the returned list by replay diff (a replay diff's differences are
   * consecutive) instead of by global priority order. Array order is the only
   * signal — there is no `index` field.
   */
  orderByReplayDiffs?: boolean;
  /**
   * Include review metadata (`decision` and `openComments`) on each screenshot.
   * Default false. Replies do not contribute to the comment count.
   */
  includeReviews?: boolean;
  /** @deprecated Use `includeReviews`. */
  includeReviewDecisions?: boolean;
  /**
   * Return only differences still awaiting review (decision `unreviewed`).
   * Default false.
   *
   * The `only*` filters are additive: when several are set, differences matching
   * any of them are returned, so combining them widens the result rather than
   * narrowing it.
   */
  onlyUnreviewed?: boolean;
  /**
   * Return only rejected differences. Additive with the other `only*` filters
   * (see {@link onlyUnreviewed}). Default false.
   */
  onlyRejected?: boolean;
  /**
   * Return only differences with one or more open review comments. Additive
   * with the other `only*` filters (see {@link onlyUnreviewed}). Default false.
   */
  onlyWithComments?: boolean;
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
  /** Rejected by a human or an agent — both block the check identically. */
  numRejected: number;
  numUnreviewed: number;
  /**
   * Differences with one or more open review comments. Cuts across the decision
   * buckets rather than partitioning them.
   */
  numWithOpenComments: number;
}

/**
 * Why a `failed` response has no data. The first three are business reasons
 * determined while waiting for the test run to finish; the rest are
 * Temporal's own terminal execution status, surfaced as-is because the
 * computation's own code never ran (so there's nothing more specific to
 * report):
 * - `test-run-not-ready`: the test run hadn't finished within the
 *   computation's bounded wait for it. **The one reason worth retrying** —
 *   the test run is likely still going, and may well have finished by the
 *   time you ask again. Ask again at least a minute later and a fresh attempt
 *   is started (answering `pending`); ask sooner and you just get this same
 *   failure back, since an immediate re-ask can't be told apart from the poll
 *   that was handed it.
 * - `test-run-unavailable`: the test run became a base run, or was aborted
 *   or skipped, while waiting for it to finish.
 * - `computation-error`: the computation itself failed (a genuine bug),
 *   after exhausting its retries.
 * - `TIMED_OUT` / `TERMINATED` / `CANCELLED`: the computation hit its own
 *   execution timeout, or was terminated/cancelled directly (e.g. by an
 *   operator) — rather than failing through its own code path.
 *
 * A `failed` response never has a computation still running behind it, so
 * stop polling when you get one. Spending another computation on the test run
 * is a separate, deliberate decision, made by asking again later.
 */
export type DiffsSummaryFailureReason =
  | "test-run-not-ready"
  | "test-run-unavailable"
  | "computation-error"
  | "TIMED_OUT"
  | "TERMINATED"
  | "CANCELLED";

export interface DiffsSummaryResponse {
  /**
   * `pending` — computation queued; `processing` — the test run or summary
   * computation is still running; poll again; `complete` — `data` is
   * populated; `failed` — no result exists and nothing is still computing
   * one, see `reason`. Stop polling on `failed`; `test-run-not-ready` is the
   * one reason worth asking again about later.
   */
  status: "pending" | "processing" | "complete" | "failed";
  data?: DiffsSummaryDiff[];
  /**
   * Present on complete responses; true when only a subset of selected
   * representative diffs is returned.
   */
  selectionApplied?: boolean;
  /**
   * How many diffs matched the query before representative selection — i.e. the
   * number `includeAllDiffs` would have returned. Present on complete responses
   * from backends that report it (absent from older ones).
   */
  numMatchingDiffs?: number;
  /** Present only when `status` is `failed`. */
  reason?: DiffsSummaryFailureReason;
}

export interface AgentDiffCommentReply {
  id: string;
  author?: string;
  /**
   * Whether an agent wrote this. A project-token agent has no `author` to give
   * it away and the text carries no marker, so this is the only thing
   * distinguishing an agent's comment from a human's.
   */
  isAgentAuthored: boolean;
  text: string;
}

export interface AgentDiffComment {
  id: string;
  author?: string;
  /** See {@link AgentDiffCommentReply.isAgentAuthored}. */
  isAgentAuthored: boolean;
  text: string;
  x: number;
  y: number;
  replies: AgentDiffCommentReply[];
  isResolved?: boolean;
}

export interface GetDiffCommentsOptions {
  includeResolved?: boolean;
}

export interface AgentDiffCommentMutationResponse {
  commentId: string;
}

export interface AgentDiffCommentCoordinates {
  /** Required approximate normalized horizontal image coordinate (0..1). */
  x: number;
  /** Required approximate normalized vertical image coordinate (0..1). */
  y: number;
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
 * - v3: returns a flat ordered list without `index` or `outcome`, and makes
 *   `mismatchFraction` opt-in.
 * - v4: returns all diffs up to five and a selected representative subset
 *   above that unless `includeAllDiffs` is explicit; removes per-row
 *   `isSelected` and adds response-level `selectionApplied` metadata.
 */
export const DIFFS_SUMMARY_CLIENT_VERSION = 4;

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

/**
 * Whether `executedRanges` should be requested/printed when the caller didn't
 * explicitly ask for it — true unless another column flag was explicitly set,
 * preserving the historical default of executed ranges for a bare invocation.
 * Shared by {@link getTestRunJsCoverage}, {@link getProjectJsCoverage}, and the
 * CLI's `determineColumns` (`public_packages/cli/src/commands/agent/coverage-columns.util.ts`).
 */
export const shouldDefaultToExecutedRanges = (
  columnFlags: Pick<
    TestRunJsCoverageOptions,
    | "includeExecutedRanges"
    | "includeExecutableRanges"
    | "includeUncoveredRanges"
    | "includeCoveragePercentage"
  >,
): boolean =>
  columnFlags.includeExecutedRanges ||
  !(
    columnFlags.includeExecutableRanges ||
    columnFlags.includeUncoveredRanges ||
    columnFlags.includeCoveragePercentage
  );

/**
 * Which columns/rows the project coverage response should carry. A subset of
 * {@link TestRunJsCoverageOptions}: there is no `prDiffOnly` (a project has no
 * PR) and no `unionTestRunIds` (the run is resolved server-side). OAuth users
 * may pass `project` to override their configured default project; project API
 * tokens derive the project from the token.
 */
export interface ProjectJsCoverageOptions {
  project?: string;
  includeAllFiles?: boolean;
  globFilter?: string;
  includeExecutedRanges?: boolean;
  includeExecutableRanges?: boolean;
  includeUncoveredRanges?: boolean;
  includeCoveragePercentage?: boolean;
}

export interface ProjectJsCoverageResponse {
  /**
   * The test run the project's coverage was resolved to (the project's latest
   * successful run — the same one the webapp's project coverage view uses), or
   * `null` when the project has no such run. `files` is empty when `null`.
   */
  testRunId: string | null;
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
  before?: string;
  after?: string;
  /**
   * @deprecated Superseded by `before`/`after`. Still populated (mirroring
   * whichever of `before`/`after` is set) for `missing-base`/`missing-head`
   * outcomes only, so already-published CLI versions reading this field keep
   * working. New consumers should use `before`/`after` instead.
   */
  screenshot?: string;
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
// Feedback types
// ---------------------------------------------------------------------------

export type AgentFeedbackOutcome = "helped" | "neutral" | "hindered";

export interface AgentFeedbackResponse {
  feedbackId: string;
}

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

/**
 * Submit free-form feedback about Meticulous to the Meticulous team. Unlike
 * telemetry, errors propagate to the caller instead of being swallowed.
 */
export const submitAgentFeedback = async ({
  client,
  message,
  outcome,
  testRunId,
  skill,
  agentName,
  agentModel,
  project,
}: {
  client: MeticulousClient;
  message: string;
  outcome?: AgentFeedbackOutcome | undefined;
  testRunId?: string | undefined;
  skill?: string | undefined;
  agentName?: string | undefined;
  agentModel?: string | undefined;
  project?: string | undefined;
}): Promise<AgentFeedbackResponse> => {
  const { data } = await client
    .post(
      "agent/feedback",
      {
        message,
        ...(outcome != null ? { outcome } : {}),
        ...(testRunId != null ? { testRunId } : {}),
        ...(skill != null ? { skill } : {}),
        ...(agentName != null ? { agentName } : {}),
        ...(agentModel != null ? { agentModel } : {}),
      },
      project ? { params: { project } } : undefined,
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
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
  if (options?.includeMismatchFraction) {
    params.includeMismatchFraction = "true";
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
  if (options?.includeReviews || options?.includeReviewDecisions) {
    params.includeReviews = "true";
  }
  if (options?.onlyUnreviewed) {
    params.onlyUnreviewed = "true";
  }
  if (options?.onlyRejected) {
    params.onlyRejected = "true";
  }
  if (options?.onlyWithComments) {
    params.onlyWithComments = "true";
  }
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/diffs-summary`, { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return normalizeDiffsSummaryResponse(
    data as DiffsSummaryResponse | LegacyDiffsSummaryResponse,
    options,
  );
};

interface LegacyDiffsSummaryResponse extends Omit<
  DiffsSummaryResponse,
  "data"
> {
  data?: DiffsSummaryReplayDiff[];
}

const normalizeDiffsSummaryResponse = (
  response: DiffsSummaryResponse | LegacyDiffsSummaryResponse,
  options: DiffsSummaryOptions | undefined,
): DiffsSummaryResponse => {
  const { data, ...metadata } = response;
  if (data == null) {
    return response as DiffsSummaryResponse;
  }
  // A v3+ backend already returns the flat shape, with mismatchFraction
  // already projected server-side (the request carried includeMismatchFraction)
  // — nothing left to normalize.
  if (data.length === 0 || !("screenshots" in data[0])) {
    return normalizeCurrentDiffsResponse(
      metadata,
      data as CompatibilityDiff[],
      options,
    );
  }
  // Legacy (pre-v3) backend: predates clientVersion gating entirely, so this
  // path exists only until every backend a published client might talk to is
  // on v3+ — remove once that's true (or, if self-hosted/enterprise backends
  // can stay on older versions indefinitely, keep it and drop this note).
  const entries = (data as DiffsSummaryReplayDiff[])
    .flatMap((replayDiff) =>
      replayDiff.screenshots.map((screenshot) => ({
        index: screenshot.index,
        diff: {
          replayDiffId: replayDiff.replayDiffId,
          screenshotName: screenshot.screenshotName,
          ...(options?.includeMismatchFraction &&
          screenshot.mismatchFraction != null
            ? { mismatchFraction: screenshot.mismatchFraction }
            : {}),
          ...(screenshot.domDiffIds != null
            ? { domDiffIds: screenshot.domDiffIds }
            : {}),
          ...(screenshot.isSelected != null
            ? { isSelected: screenshot.isSelected }
            : {}),
          ...(screenshot.decision != null
            ? { decision: screenshot.decision }
            : {}),
          ...(screenshot.openComments != null
            ? { openComments: screenshot.openComments }
            : {}),
          ...(replayDiff.baseReplayId != null
            ? { baseReplayId: replayDiff.baseReplayId }
            : {}),
          ...(replayDiff.headReplayId != null
            ? { headReplayId: replayDiff.headReplayId }
            : {}),
        } satisfies CompatibilityDiff,
      })),
    )
    .sort((a, b) => a.index - b.index);
  return normalizeCurrentDiffsResponse(
    metadata,
    entries.map(({ diff }) => diff),
    options,
  );
};

interface CompatibilityDiff extends DiffsSummaryDiff {
  isSelected?: boolean;
}

/**
 * Mirrors the backend's `DEFAULT_REPRESENTATIVE_SELECTION_THRESHOLD` for the
 * old-backend shim below. Kept in sync by hand since the client and backend
 * are separate packages.
 */
const LEGACY_REPRESENTATIVE_SELECTION_THRESHOLD = 5;

const normalizeCurrentDiffsResponse = (
  metadata: Omit<DiffsSummaryResponse, "data">,
  data: CompatibilityDiff[],
  options: DiffsSummaryOptions | undefined,
): DiffsSummaryResponse => {
  const isOldBackend = metadata.selectionApplied == null;
  const canCapToRepresentativeSubset =
    isOldBackend &&
    options?.includeAllDiffs !== true &&
    // onlyRejected/onlyWithComments always return every matching difference —
    // never subject to the representative-subset cap (see the backend's
    // agent.diffs-summary.utils.ts) — so an old backend's response to either
    // is already complete and must not be re-capped here.
    options?.onlyRejected !== true &&
    options?.onlyWithComments !== true &&
    data.length > LEGACY_REPRESENTATIVE_SELECTION_THRESHOLD &&
    // Only cap when every row reports isSelected. A partially-present field
    // would otherwise arm the filter below and then silently drop rows where
    // it happens to be missing — requiring it on every row is the safe
    // direction: worst case we skip capping, never wrongly drop a diff.
    data.every((diff) => diff.isSelected != null);
  let selectedData = data;
  let cappingApplied = false;
  if (canCapToRepresentativeSubset) {
    const selected = data.filter((diff) => diff.isSelected === true);
    // Mirror the backend's onlyUnreviewed fallback: if every representative
    // diff has already been reviewed away, the intersection is empty — fall
    // back to every matching difference rather than reporting a false
    // "nothing left".
    if (selected.length > 0) {
      selectedData = selected;
      cappingApplied = selected.length < data.length;
    }
  }
  const selectionApplied =
    metadata.selectionApplied ?? (cappingApplied || undefined);
  // Only report a matching count we actually know: from the backend, or — when
  // this client did the capping itself — the pre-cap set it capped.
  const numMatchingDiffs =
    metadata.numMatchingDiffs ?? (cappingApplied ? data.length : undefined);
  return {
    ...metadata,
    ...(selectionApplied != null ? { selectionApplied } : {}),
    ...(numMatchingDiffs != null ? { numMatchingDiffs } : {}),
    data: selectedData.map(({ isSelected: _isSelected, ...diff }) => diff),
  };
};

export const getDiffComments = async (
  client: MeticulousClient,
  replayDiffId: string,
  screenshotName: string,
  options: GetDiffCommentsOptions = {},
): Promise<AgentDiffComment[]> => {
  const params: Record<string, string> = {};
  if (options.includeResolved) {
    params.includeResolved = "true";
  }
  const { data } = await client
    .get(
      `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/comments`,
      { params },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

/** Record an agent review rejecting one screenshot difference. */
export const rejectDiff = async ({
  client,
  replayDiffId,
  screenshotName,
  reason,
  x,
  y,
}: {
  client: MeticulousClient;
  replayDiffId: string;
  screenshotName: string;
  reason: string;
  x: number;
  y: number;
}): Promise<void> => {
  await client
    .post(
      `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/reject`,
      { reason, x, y },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
};

/** Record an agent review ignoring one screenshot difference. */
export const ignoreDiff = async ({
  client,
  replayDiffId,
  screenshotName,
  reason,
  x,
  y,
}: {
  client: MeticulousClient;
  replayDiffId: string;
  screenshotName: string;
  reason: string;
  x: number;
  y: number;
}): Promise<void> => {
  await client
    .post(
      `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/ignore`,
      { reason, x, y },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
};

/** Start a review comment thread on one screenshot difference. */
export const createDiffComment = async ({
  client,
  replayDiffId,
  screenshotName,
  text,
  x,
  y,
}: {
  client: MeticulousClient;
  replayDiffId: string;
  screenshotName: string;
  text: string;
  x: number;
  y: number;
}): Promise<AgentDiffCommentMutationResponse> => {
  const { data } = await client
    .post(
      `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/comments`,
      { text, x, y },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

/** Reply to an existing root review comment. */
export const replyToDiffComment = async ({
  client,
  commentId,
  text,
}: {
  client: MeticulousClient;
  commentId: string;
  text: string;
}): Promise<AgentDiffCommentMutationResponse> => {
  const { data } = await client
    .post(`agent/diff-comments/${commentId}/replies`, {
      text,
    })
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
  context?: string,
): Promise<ScreenshotDomDiffResponse> => {
  const params: Record<string, string> = {};
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

// ---------------------------------------------------------------------------
// Identity and project selection
//
// The `agent/*` counterparts of the older `oauth/*` endpoints. Those remain the
// mechanism the CLI resolves a default project through on every OAuth call;
// these are only ever hit when the *user* asks who they are or which project
// they are pointed at, which is what makes them measurable as operations.
// ---------------------------------------------------------------------------

export interface AgentWhoamiResponse {
  authenticatedVia: "oauth" | "project-api-token" | "test-run-token";
  email?: string;
  firstName?: string;
  lastName?: string;
  isAdmin?: boolean;
  organizations?: { name: string; role: string | null }[];
  /** `"organization/name"` slug, or `null` for a user with no default project. */
  selectedProject: string | null;
}

export interface AgentProjectListItem {
  id: string;
  name: string;
  organization: { name: string };
}

export interface AgentCurrentProjectResponse {
  /** `"organization/name"` slug. */
  project: string;
  projectId: string;
  /**
   * Whether the project came from the user's stored default, was auto-picked
   * because it's the caller's only accessible project (no preference stored
   * yet, but `set_project`/`auth set-project` can still change it), or came
   * from the token.
   */
  source: "user-default" | "auto-picked" | "api-token";
}

export interface AgentSetProjectResponse {
  /** `"organization/name"` slug. */
  project: string;
  projectId: string;
}

export const getAgentWhoami = async (
  client: MeticulousClient,
): Promise<AgentWhoamiResponse> => {
  const { data } = await client.get("agent/whoami").catch((error) => {
    throw maybeEnrichFetchError(error);
  });
  return data;
};

export const getAgentProjects = async (
  client: MeticulousClient,
): Promise<AgentProjectListItem[]> => {
  const { data } = await client.get("agent/projects").catch((error) => {
    throw maybeEnrichFetchError(error);
  });
  return data;
};

export const getAgentCurrentProject = async (
  client: MeticulousClient,
): Promise<AgentCurrentProjectResponse> => {
  const { data } = await client.get("agent/project").catch((error) => {
    throw maybeEnrichFetchError(error);
  });
  return data;
};

export const setAgentCurrentProject = async (
  client: MeticulousClient,
  project: string,
): Promise<AgentSetProjectResponse> => {
  const { data } = await client
    .put<{ project: string }, Response<AgentSetProjectResponse>>(
      "agent/project",
      { project },
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
  // The V2 endpoint requires at least one column and 400s otherwise; default
  // to executed ranges so a bare `getTestRunJsCoverage(client, testRunId)`
  // keeps returning executed ranges rather than erroring.
  const includeExecutedRanges = shouldDefaultToExecutedRanges(options ?? {});
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

// Returns whole-project coverage: the backend resolves the project's latest
// successful test run (the same run the webapp's "View coverage & snapshots"
// uses) and serves its whole-run coverage. The response echoes the resolved
// `testRunId` (null when the project has no such run). Mirrors
// getTestRunJsCoverage's per-file V2 columns, minus prDiffOnly/union. The
// project comes from the token; OAuth user tokens may pass `project` to
// override their configured default project.
export const getProjectJsCoverage = async (
  client: MeticulousClient,
  options?: ProjectJsCoverageOptions,
): Promise<ProjectJsCoverageResponse> => {
  const params: Record<string, string> = {
    clientVersion: String(TESTRUN_JS_COVERAGE_CLIENT_VERSION),
  };
  const includeExecutedRanges = shouldDefaultToExecutedRanges(options ?? {});
  if (options?.project != null && options.project !== "") {
    params.project = options.project;
  }
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
  const { data } = await client
    .get("agent/projects/js-coverage", { params })
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

/**
 * How a session's row came to exist, derived from its id suffix. Mirrors
 * webapp-backend's `AgentSessionStatus` (agent.types.ts) — kept as a literal
 * union here rather than imported, since `public_packages` can't depend on
 * webapp-backend.
 */
export type SessionStatus = "original" | "patched" | "sliced" | "mutated";

/**
 * Why the recorder gave up on a session before it finished normally. Mirrors
 * `SessionAbandonmentReasonEnum` in `packages/session-payload-api` (a private
 * package `public_packages` can't depend on) — keep the two in sync.
 */
export type SessionAbandonmentReason =
  | "payload_size"
  | "max_uploads"
  | "max_session_time"
  | "user_requested"
  | "error_creating_payload"
  | "superseded_by_native_recorder";

/** One row of the recent-sessions listing. */
export interface SessionListItem {
  id: string;
  /**
   * When this session entry was created, as an ISO-8601 string — the stored
   * row timestamp and the basis of the newest-first ordering. Equal to
   * `recordedAt` for an original session; for a non-original session it's
   * when that row itself was produced, so it can be later than `recordedAt`.
   */
  createdAt: string;
  /**
   * When the session was originally recorded, as an ISO-8601 string. For a
   * non-original session (patched, sliced, or mutated) this is the root
   * session's recording time; otherwise it equals `createdAt`.
   */
  recordedAt: string;
  /**
   * The identity that recorded the session (email, falling back to a user
   * id). Omitted if neither was set.
   */
  recordedBy?: string;
  /**
   * How this session's row came to exist. Omitted when
   * `excludeSyntheticSessions` is set (every row is then `original`).
   */
  status?: SessionStatus;
  /**
   * The session's duration in seconds, computed from its first and last
   * recorded user event with a timestamp. Included only when
   * `includeDurationSeconds` is set and a duration could be computed (e.g.
   * omitted for sessions recorded before this was tracked).
   */
  durationSeconds?: number;
  /**
   * The number of recorded user events. Included only when
   * `includeNumberUserEvents` is set.
   */
  numberUserEvents?: number;
  /**
   * The number of recorded URL visits, including the initial URL and repeated
   * visits. Included only when `includeNumberUrlsVisited` is set.
   */
  numberUrlsVisited?: number;
  /** The session's start URL. Included only when `includeStartUrl` is set. */
  startUrl?: string;
  /**
   * The reason the recorder gave up on the session before it finished normally
   * (meaning the recording is incomplete). Included only when
   * `includeAbandonedReason` is set, and then only for abandoned sessions.
   */
  abandonedReason?: SessionAbandonmentReason;
}

export interface SessionsResponse {
  /** The project's most recently recorded sessions, newest first. */
  sessions: SessionListItem[];
}

// Lists the project's most recently created sessions, newest first.
// Project/test-run API tokens determine the project; OAuth user tokens may
// pass `project` to override which project this call targets, falling back to
// the caller's stored default project when omitted.
//
// `limit` is always applied (server-side default 100, max 1000), so a response
// never exceeds `limit` rows regardless of the filters; `offset` may page
// arbitrarily far (offset + limit is not capped).
export const getSessions = async (
  client: MeticulousClient,
  options?: {
    project?: string | undefined;
    createdSince?: string | undefined;
    createdUntil?: string | undefined;
    recordedSince?: string | undefined;
    recordedUntil?: string | undefined;
    recordedBy?: string | undefined;
    excludeSyntheticSessions?: boolean | undefined;
    visitedUrlFilter?: string | undefined;
    includeDurationSeconds?: boolean | undefined;
    includeNumberUserEvents?: boolean | undefined;
    includeNumberUrlsVisited?: boolean | undefined;
    includeStartUrl?: boolean | undefined;
    includeAbandonedReason?: boolean | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  },
): Promise<SessionsResponse> => {
  const params: Record<string, string> = {};
  if (options?.project != null) {
    params.project = options.project;
  }
  if (options?.createdSince != null) {
    params.createdSince = options.createdSince;
  }
  if (options?.createdUntil != null) {
    params.createdUntil = options.createdUntil;
  }
  if (options?.recordedSince != null) {
    params.recordedSince = options.recordedSince;
  }
  if (options?.recordedUntil != null) {
    params.recordedUntil = options.recordedUntil;
  }
  if (options?.recordedBy != null) {
    params.recordedBy = options.recordedBy;
  }
  if (options?.excludeSyntheticSessions) {
    params.excludeSyntheticSessions = "true";
  }
  if (options?.visitedUrlFilter != null) {
    params.visitedUrlFilter = options.visitedUrlFilter;
  }
  if (options?.includeDurationSeconds) {
    params.includeDurationSeconds = "true";
  }
  if (options?.includeNumberUserEvents) {
    params.includeNumberUserEvents = "true";
  }
  if (options?.includeNumberUrlsVisited) {
    params.includeNumberUrlsVisited = "true";
  }
  if (options?.includeStartUrl) {
    params.includeStartUrl = "true";
  }
  if (options?.includeAbandonedReason) {
    params.includeAbandonedReason = "true";
  }
  if (options?.limit != null) {
    params.limit = String(options.limit);
  }
  if (options?.offset != null) {
    params.offset = String(options.offset);
  }
  const { data } = await client
    .get("agent/sessions", { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};
