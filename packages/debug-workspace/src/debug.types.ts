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
  executionSha: string | undefined;
}
