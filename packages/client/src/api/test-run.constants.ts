import { TestRunStatus } from "@alwaysmeticulous/api";

export const IN_PROGRESS_TEST_RUN_STATUS: TestRunStatus[] = [
  "PreProcessing",
  "Scheduled",
  "Running",
  "PostProcessing",
];

/**
 * Terminal test run statuses: a run in one of these will not progress further,
 * so callers waiting for completion (e.g. {@link findTestRunByIdAndWaitForCompletion})
 * can stop polling once a run reaches one of them.
 */
export const COMPLETED_TEST_RUN_STATUSES: TestRunStatus[] = [
  "Success",
  "Failure",
  "Aborted",
  "ExecutionError",
];
