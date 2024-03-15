import { TestRun } from "@alwaysmeticulous/client";

interface TunnelData {
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

  environment: string;
}

export interface ExecuteRemoteTestRunResult {
  testRun: TestRun;
}
