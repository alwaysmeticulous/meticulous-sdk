import { ExecuteTestRunOptions } from "./execute-test-run";

export type ExecuteScheduledTestRunOptions = Pick<
  ExecuteTestRunOptions,
  | "chromeExecutablePath"
  | "parallelTasks"
  | "maxRetriesOnFailure"
  | "rerunTestsNTimes"
  | "logLevel"
> & {
  /**
   * The API token to use to authenticate with .
   */
  apiToken: string;
  /**
   * The ID of the scheduled test run to execute.
   */
  testRunId: string;
};
