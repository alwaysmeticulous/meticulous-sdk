import type { ExecuteTestRunOptions } from "./execute-test-run";

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

  /**
   * Epoch milliseconds at which the worker running this chunk will kill it.
   * When set, flake-check retries that are unlikely to finish before then are
   * skipped. When absent, retries are scheduled without regard to time.
   */
  chunkDeadlineEpochMs?: number;
};
