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
}

export interface ExecuteRemoteTestRunResult {
  testRun: TestRun;
}
