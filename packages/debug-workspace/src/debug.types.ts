import type { ScreenshotIdentifier } from "./screenshot-identifier";

export interface TimelineEntry {
  kind: string;
  start?: number;
  end?: number;
  virtualTimeStart?: number;
  virtualTimeEnd?: number;
  data?: Record<string, unknown> & {
    identifier?: ScreenshotIdentifier;
  };
}

/** A timeline entry with its position in the stored timeline file. */
export interface PositionedTimelineEntry {
  entry: TimelineEntry;
  fileIndex: number;
}

export interface ReplayDiffInfo {
  id: string;
  headReplayId: string;
  baseReplayId: string;
  sessionId: string | undefined;
  numScreenshotDiffs: number;
}

export interface DebugContext {
  testRunId: string | undefined;
  replayDiffs: ReplayDiffInfo[];
  replayIds: string[];
  sessionIds: string[];
  projectId: string | undefined;
  orgAndProject: string;
  commitSha: string | undefined;
  baseCommitSha: string | undefined;
  testRunStatus: string | undefined;
  screenshot: string | undefined;
  meticulousSha: string | undefined;
  baseMeticulousSha: string | undefined;
  executionSha: string | undefined;
}
