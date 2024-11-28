import { ExecuteTestRunOptions } from "./execute-test-run";

export type ExecuteScheduledTestRunChunkOptions = Pick<
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
   * The chunk number to execute.
   */
  chunkNumber: number;
};
