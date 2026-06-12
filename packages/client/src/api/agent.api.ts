import { SessionContext, TestRunStatus } from "@alwaysmeticulous/api";
import { maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

// ---------------------------------------------------------------------------
// Diffs Summary types
// ---------------------------------------------------------------------------

export interface DiffsSummaryScreenshot {
  screenshotName: string;
  index: number;
  total: number;
  outcome: string;
  userVisibleOutcome: string;
  mismatchFraction: number | null;
  domDiffIds: string;
}

export interface DiffsSummaryReplayDiff {
  replayDiffId: string;
  baseReplayId?: string;
  headReplayId?: string;
  screenshots: DiffsSummaryScreenshot[];
}

export interface DiffsSummaryOptions {
  includeReplayIds?: boolean;
  includeMatches?: boolean;
}

export interface DiffsSummaryResponse {
  status: "pending" | "processing" | "complete";
  data?: DiffsSummaryReplayDiff[];
}

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
  projectId,
}: {
  client: MeticulousClient;
  feature: AgentFeature;
  projectId: string | undefined;
}): Promise<void> => {
  await client
    .post(
      "agent/telemetry",
      { feature },
      projectId ? { params: { projectId } } : undefined,
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
  const params: Record<string, string> = {};
  if (options?.includeReplayIds) {
    params.includeReplayIds = "true";
  }
  if (options?.includeMatches) {
    params.includeMatches = "true";
  }
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/diffs-summary`, { params })
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
// `{ testRunId: null }` when the project has no matching run. The project comes
// from the token; OAuth user tokens must pass `projectId`.
export const getTestRunForCommit = async (
  client: MeticulousClient,
  commitSha: string,
  options?: { projectId?: string | undefined },
): Promise<TestRunForCommitResponse> => {
  const params: Record<string, string> = { commitSha };
  if (options?.projectId != null) {
    params.projectId = options.projectId;
  }
  const { data } = await client
    .get("agent/test-runs", { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

// Returns the whole test run's executed line ranges from the precomputed,
// repo-mapped coverage.json (keyed by repo-relative path).
export const getTestRunJsCoverage = async (
  client: MeticulousClient,
  testRunId: string,
): Promise<TestRunJsCoverageResponse> => {
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/js-coverage`)
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
  options?: {
    screenshotName?: string | undefined;
    testRunId?: string | undefined;
  },
): Promise<ReplayJsCoverageResponse> => {
  const path =
    options?.screenshotName != null
      ? `agent/replays/${replayId}/screenshots/${encodeURIComponent(options.screenshotName)}/js-coverage`
      : `agent/replays/${replayId}/js-coverage`;
  const params: Record<string, string> = {};
  if (options?.testRunId != null) {
    params.testRunId = options.testRunId;
  }
  const { data } = await client.get(path, { params }).catch((error) => {
    throw maybeEnrichFetchError(error);
  });
  return data;
};

// Coverage *diff* for a replay diff (base vs head). Omit screenshotName for the
// whole-replay diff.
export const getReplayDiffJsCoverage = async (
  client: MeticulousClient,
  replayDiffId: string,
  screenshotName?: string,
): Promise<ReplayDiffJsCoverageDiffResponse> => {
  const path =
    screenshotName != null
      ? `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/js-coverage-diff`
      : `agent/replay-diffs/${replayDiffId}/js-coverage-diff`;
  const { data } = await client.get(path).catch((error) => {
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
