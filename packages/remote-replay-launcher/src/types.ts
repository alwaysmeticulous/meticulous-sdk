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

  onTunnelCreated?: (data: TunnelData) => void;
  onTestRunCreated?: (testRun: TestRun) => void;
  onProgressUpdate?: (testRun: TestRun) => void;

  /**
   * If set, the tunnel will be kept open until this promise is resolved.
   * `executeRemoteTestRun` will not resolve until this promise is resolved.
   */
  keepTunnelOpenPromise?: Promise<void>;

  environment: string;
}

export interface ExecuteRemoteTestRunResult {
  testRun: TestRun;
}
