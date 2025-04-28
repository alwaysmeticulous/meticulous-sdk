import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { TestRun } from "@alwaysmeticulous/client";

export interface TunnelData {
  url: string;
  basicAuthUser: string;
  basicAuthPassword: string;
}
export interface ExecuteRemoteTestRunOptions {
  apiToken: string | null | undefined;

  /**
   * The application to test. This should be either:
   * - appUrl: A URL which will result in a tunnel being created.
   * - appDirectory: A local directory path which will result in the app being bundled and uploaded to S3.
   * We expect precisely one of these to be provided, and will throw an error if that's not the case.
   */
  appUrl?: string;
  appDirectory?: string;

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

  /**
   * A set of rewrite rules to apply. Note these are only applied to bundles uploaded to S3.
   * If you are opening a tunnel to a server, you should apply any rewrite rules in the server.
   */
  rewrites?: AssetUploadMetadata["rewrites"];
}

export interface ExecuteRemoteTestRunResult {
  testRun: TestRun | null;
}
