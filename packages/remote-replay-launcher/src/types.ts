import type {
  AssetUploadMetadata,
  TestRun,
  TestRunTriggerDebugContext,
} from "@alwaysmeticulous/api";
import type {
  ContainerEnvVariable,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import type { GitHubDelayedRetrySkipReason } from "./github-rate-limit-retry";

export interface CompanionAssetsOptions {
  folder?: string | undefined;
  zip?: string | undefined;
  /**
   * A path to a file or directory inside the uploaded Docker image (e.g.
   * `/app/dist`) to extract and serve as the companion assets bundle. Only
   * applicable when uploading a container (`uploadContainer` /
   * `uploadContainerAndTriggerTestRun`) — exactly one of `folder`, `zip`, or
   * `pathInImage` must be provided.
   */
  pathInImage?: string | undefined;
  regex: string;
}

export interface UploadAndTriggerTestRunResult {
  testRun: TestRun | null;
  skipReason?: "comments_disabled_for_author" | GitHubDelayedRetrySkipReason;
  message?: string;
  sourceDeploymentId?: string;
}

export interface UploadAssetsAndTriggerTestRunOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  commitSha: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  /**
   * If true, before triggering a test run, the launcher will wait for a base test run to be created. If that is not found,
   * it will trigger a test run without waiting for a base test run.
   */
  waitForBase: boolean;
  rewrites?: AssetUploadMetadata["rewrites"];
  createDeployment?: boolean;
  debugContext?: TestRunTriggerDebugContext;
}

export interface UploadContainerAndTriggerTestRunOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  localImageTag: string;
  commitSha: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  /**
   * If true, before triggering a test run, the launcher will wait for a base test run to be created. If that is not found,
   * it will trigger a test run without waiting for a base test run.
   */
  waitForBase: boolean;

  containerPort?: number;
  containerEnv?: ContainerEnvVariable[];
  containerHealthCheckEndpoint?: string;
  companionAssets?: CompanionAssetsOptions;
  debugContext?: TestRunTriggerDebugContext;
}
