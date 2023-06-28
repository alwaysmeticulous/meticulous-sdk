import { ExecuteTestRunOptions } from "./execute-test-run";

export type ExecuteScheduledTestRunOptions = Pick<
  ExecuteTestRunOptions,
  | "chromeExecutablePath"
  | "apiToken"
  | "parallelTasks"
  | "logLevel"
  | "logicalEnvironmentVersion"
> & {
  /**
   * The ID of the scheduled test run to execute.
   */
  testRunId: string;

  /**
   * If true then the test run will be restarted even if it's already completed or in the process of running.
   *
   * Existing test run results will be deleted and overwritten.
   */
  forceRestart?: boolean;
};
