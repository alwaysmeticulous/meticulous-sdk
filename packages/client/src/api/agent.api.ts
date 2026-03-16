import { maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

// ---------------------------------------------------------------------------
// Diffs Summary types
// ---------------------------------------------------------------------------

export interface DiffsSummaryOptions {
  includeDomDiffGroups?: boolean;
  includeImageDiffHashes?: boolean;
  includeJsCoverageGroups?: boolean;
  includeCssCoverageGroups?: boolean;
  includeReplayIds?: boolean;
  showAll?: boolean;
}

export interface DiffsSummaryScreenshot {
  screenshotName: string;
  index: number;
  total: number;
  outcome: string;
  userVisibleOutcome: string;
  mismatchFraction: number | null;
  domDiffIds: string;
  imageDiffId?: string;
  jsCoverageGroupId?: string;
  cssCoverageGroupId?: string;
}

export interface DiffsSummaryReplayDiff {
  replayDiffId: string;
  baseReplayId?: string;
  headReplayId?: string;
  screenshots: DiffsSummaryScreenshot[];
}

export interface DiffsSummaryResponse {
  jobId: string;
  status: "pending" | "processing" | "complete" | "error";
  progress?: string;
  error?: string;
  data?: DiffsSummaryReplayDiff[];
}

// ---------------------------------------------------------------------------
// Diffs Summary Jobs types
// ---------------------------------------------------------------------------

export interface DiffsSummaryJob {
  jobId: string;
  testRunId: string;
  status: "pending" | "processing" | "complete" | "error";
  progress?: string;
  error?: string;
  createdAt: number;
}

export interface DiffsSummaryJobsResponse {
  jobs: DiffsSummaryJob[];
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
// API methods
// ---------------------------------------------------------------------------

export const getDiffsSummaryJobs = async (
  client: MeticulousClient,
): Promise<DiffsSummaryJobsResponse> => {
  const { data } = await client
    .get("agent/test-runs/diffs-summary-jobs")
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const triggerTestRunDiffsSummary = async (
  client: MeticulousClient,
  testRunId: string,
  options: DiffsSummaryOptions,
): Promise<DiffsSummaryResponse> => {
  const { data } = await client
    .post("agent/test-runs/diffs-summary-jobs", { testRunId, ...options })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getTestRunDiffsSummaryStatus = async (
  client: MeticulousClient,
  jobId: string,
): Promise<DiffsSummaryResponse> => {
  const { data } = await client
    .get(`agent/test-runs/diffs-summary-jobs/${jobId}`)
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
): Promise<ScreenshotDomDiffResponse> => {
  const params: Record<string, string> = {};
  if (index != null) {
    params.index = String(index);
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
