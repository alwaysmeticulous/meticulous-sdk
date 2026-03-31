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
// Telemetry types
// ---------------------------------------------------------------------------

export type AgentFeature =
  | "debug-replay-diff"
  | "debug-replay";

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const trackAgentFeatureUsage = async (
  client: MeticulousClient,
  feature: AgentFeature,
): Promise<void> => {
  await client.post("agent/telemetry", { feature }).catch(() => {
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
