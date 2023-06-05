import { ExecuteTestRunOptions } from "./execute-test-run";

export type ExecuteScheduledTestRunOptions = Pick<
  ExecuteTestRunOptions,
  | "chromeExecutablePath"
  | "apiToken"
  | "parallelTasks"
  | "maxRetriesOnFailure"
  | "rerunTestsNTimes"
  | "logLevel"
  | "logicalEnvironmentVersion"
> & {
  /**
   * The ID of the scheduled test run to execute.
   */
  testRunId: string;
};