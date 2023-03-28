export { getProject } from "./api/project.api";
export { createReplayDiff, getReplayDiff } from "./api/replay-diff.api";
export {
  getRecordedSession,
  getRecordedSessionData,
  getRecordingCommandId,
  postSessionIdNotification,
} from "./api/session.api";
export { getTestRun, GetLatestTestRunResultsOptions } from "./api/test-run.api";
export { ScreenshotLocator } from "./api/types";

export { createClient, ClientOptions } from "./client";
