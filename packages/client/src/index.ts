export {
  AgentFeature,
  StructuredSessionDataResponse,
  StructuredSessionSummary,
  DiffsSummaryOptions,
  DiffsSummaryScreenshot,
  DiffsSummaryReplayDiff,
  DiffsSummaryResponse,
  ScreenshotDomDiffResponse,
  ScreenshotUrlsResponse,
  TimelineDiffEntry,
  TimelineDiffResponse,
  getStructuredSessionData,
  getTestRunDiffsSummary,
  getScreenshotDomDiff,
  getScreenshotUrls,
  getTimelineDiff,
  trackAgentFeatureUsage,
} from "./api/agent.api";
export * from "./api/github-cloud-replay.api";
export { WhoamiResponse, getWhoami } from "./api/oauth.api";
export {
  GetRepoUrlOptions,
  RepoUrlResponse,
  getProject,
  getRepoUrl,
  GetSourceArchiveUrlOptions,
  SourceArchiveUrlResponse,
  getSourceArchiveUrl,
  RequestSourceCodeUploadUrlParams,
  RequestSourceCodeUploadUrlResponse,
  requestSourceCodeUploadUrl,
} from "./api/project.api";
export {
  ReplayV3UploadLocations,
  getReplay,
  getReplayDownloadUrl,
  getReplayV3DownloadUrls,
} from "./api/replay.api";
export {
  getRecordedSession,
  getRecordedSessionData,
  getRecordingCommandId,
  postSessionIdNotification,
} from "./api/session.api";
export { ReplayDiffResponse, getReplayDiff } from "./api/replay-diff.api";
export { getPrDiff } from "./api/source-code.api";
export {
  ExecuteSecureTunnelTestRunOptions,
  executeSecureTunnelTestRun,
  getTestRun,
  getTestRunData,
  getTestRunReplayDiffs,
  GetLatestTestRunOptions,
  getLatestTestRunResults,
  TestRun,
  emitTelemetry,
} from "./api/test-run.api";
export { GetIsLockedOptions, getIsLocked } from "./api/deployment-lock.api";
export { IN_PROGRESS_TEST_RUN_STATUS } from "./api/test-run.constants";
export { getApiToken, getAuthToken } from "./api-token.utils";
export {
  ClientOptions,
  createClient,
  createClientWithOAuth,
  isInteractiveContext,
  makeRequest,
} from "./client";
export { performOAuthLogin } from "./oauth/oauth-login";
export { getValidAccessToken } from "./oauth/oauth-refresh";
export { clearOAuthTokens } from "./oauth/oauth-token-store";
export type { MeticulousClient } from "./types/client.types";
export { getProxyAgent } from "./utils/get-proxy-agent";
export {
  UploadError,
  isTransientUploadError,
  retryTransientUploadErrors,
  RetryTransientUploadErrorsOptions,
} from "./utils/retry-transient-upload-errors";
export {
  RequestAssetUploadParams,
  RequestAssetUploadResponse,
  requestAssetUpload,
  requestMultipartAssetUpload,
  RequestMultipartAssetUploadResponse,
  RequestUploadPartParams,
  RequestUploadPartResponse,
  requestUploadPart,
  RequestGitDiffUploadParams,
  RequestGitDiffUploadResponse,
  requestGitDiffUpload,
  CompleteAssetUploadParams,
  CompleteAssetUploadResponse,
  completeAssetUpload,
  CompleteContainerUploadParams,
  CompleteContainerUploadResponse,
  completeContainerUpload,
  MultiPartUploadInfo,
  DownloadDeploymentResponse,
  downloadProjectDeployment,
  GetContainerDeploymentResponse,
  getContainerDeployment,
  ContainerEnvVariable,
} from "./api/project-deployments.api";
export { GetRegistryAuthResponse, getRegistryAuth } from "./api/registry.api";
export { isFetchError } from "./errors";
export {
  EditedFileWithLines,
  GetRelevantSessionsParams,
  GetRelevantSessionsResponse,
  RelevantSession,
  getRelevantSessions,
} from "./api/local-changes.api";
/**
 * @deprecated Prefer importing `TestRunDataLocations` from `@alwaysmeticulous/api` instead of `@alwaysmeticulous/client`.
 */
export { TestRunDataLocations } from "@alwaysmeticulous/api";
