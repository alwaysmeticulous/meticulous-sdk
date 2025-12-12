import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { TestRun } from "@alwaysmeticulous/client";

export interface TunnelData {
  url: string;
  basicAuthUser: string;
  basicAuthPassword: string;
}

export interface ExecuteRemoteTestRunOptions {
  apiToken: string | null | undefined;

  appUrl: string;
  commitSha: string;

  secureTunnelHost?: string | undefined;

  onTunnelCreated?: (data: TunnelData) => void;
  onTestRunCreated?: (testRun: TestRun) => void;
  onProgressUpdate?: (testRun: TestRun) => void;

  /**
   * Called periodically when the test run has completed but the tunnel is still locked.
   */
  onTunnelStillLocked?: () => void;

  /**
   * If set, the tunnel will be kept open until this promise is resolved.
   * `executeRemoteTestRun` will not resolve until this promise is resolved.
   */
  keepTunnelOpenPromise?: Promise<void>;

  environment: string;
  isLockable: boolean;

  /**
   * The ID of the pull request in the hosting provider, if one is available.
   * The backend will try to automatically find one from the commit if this is not provided, but in some
   * cases (e.g. PRs from forks on GitHub) this may not work, hence one can be provided here.
   */
  pullRequestHostingProviderId?: string;

  allowInvalidCert?: boolean;
  proxyAllUrls?: boolean;
  rewriteHostnameToAppUrl?: boolean;
  enableDnsCache?: boolean;
  http2Connections?: number | undefined;
  companionAssets?: {
    folder?: string | undefined;
    zip?: string | undefined;
    regex: string;
  };

  /**
   * Post a comment for this test run, even if comments are still disabled for the project.
   */
  postComment?: boolean;
}

export interface ExecuteRemoteTestRunResult {
  testRun: TestRun | null;
}

export interface UploadAssetsAndTriggerTestRunOptions {
  apiToken: string | null | undefined;
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  commitSha: string;
  /**
   * If true, before triggering a test run, the launcher will wait for a base test run to be created. If that is not found,
   * it will trigger a test run without waiting for a base test run.
   */
  waitForBase: boolean;
  rewrites?: AssetUploadMetadata["rewrites"];
  createDeployment?: boolean;
}
