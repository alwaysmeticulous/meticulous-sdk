import type { TestRunStatus } from "@alwaysmeticulous/api";

export const IN_PROGRESS_TEST_RUN_STATUS: TestRunStatus[] = [
  "PreProcessing",
  "Scheduled",
  "Running",
  "PostProcessing",
];
