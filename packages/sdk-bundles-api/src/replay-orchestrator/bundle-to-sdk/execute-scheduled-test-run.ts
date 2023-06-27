import { ExecuteTestRunResult } from "./execute-test-run";

export interface InProgressTestRun {
  /**
   * The results of the tests that were executed. Resolves when the test run completes.
   */
  result: Promise<ExecuteTestRunResult>;
  markTestRunAsFailed: () => Promise<void>;
}
