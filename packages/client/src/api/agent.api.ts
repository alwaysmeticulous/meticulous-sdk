import { SessionContext } from "@alwaysmeticulous/api";
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
// API methods
// ---------------------------------------------------------------------------

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
