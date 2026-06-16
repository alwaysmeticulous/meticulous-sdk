export {
  ReportCustomCheckResultsOptions,
  reportCustomCheckResults,
} from "./report-custom-check-results";
export {
  WaitForTestRunCompletionOptions,
  WaitForTestRunResult,
  FindTestRunByCommitForCustomChecksOptions,
  findTestRunByCommitForCustomChecks,
  FindTestRunForCustomChecksOptions,
  findTestRunForCustomChecks,
} from "./wait-for-test-run";
export {
  GetSnapshotsFromTestRunOptions,
  SnapshotsFromTestRun,
  getSnapshotsFromTestRun,
} from "./get-snapshots-from-test-run";

// Re-export the client building blocks a custom-check script needs (creating a
// client), so everything can be imported from one package.
export {
  createClient,
  createClientWithOAuth,
  MeticulousClient,
} from "@alwaysmeticulous/client";

// Re-export the custom-check authoring and transport types.
export {
  CustomCheckVerdict,
  CustomCheckOutput,
  CustomCheckReport,
  MarkdownReport,
  Snapshot,
  ReportedCustomCheckResult,
  ReportCustomCheckResultsRequest,
  CustomCheckResultsStatus,
  CUSTOM_CHECK_RESULTS_STATUSES,
  CUSTOM_CHECK_SUMMARY_MAX_LENGTH,
} from "@alwaysmeticulous/api";
