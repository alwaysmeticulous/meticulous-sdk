import type { ReportCustomCheckResultsRequest } from "@alwaysmeticulous/api";
import {
  maybeEnrichFetchError,
  type MeticulousClient,
} from "@alwaysmeticulous/client";

export interface ReportCustomCheckResultsOptions {
  client: MeticulousClient;
  testRunId: string;
  /**
   * The results to report: either every check's result (`status: "complete"`)
   * or a single execution error for the run as a whole (`status:
   * "execution-error"`).
   */
  results: ReportCustomCheckResultsRequest;
}

/**
 * Reports the custom check results computed for a test run (e.g. from a job in
 * the customer's CI after the run completes). May be called only once per test
 * run — a second call fails. Pair with {@link findTestRunByCommitAndWaitForCompletion}
 * and `getSnapshotsFromTestRun` to write a custom check from any script.
 */
export const reportCustomCheckResults = async ({
  client,
  testRunId,
  results,
}: ReportCustomCheckResultsOptions): Promise<void> => {
  await client
    .post(`test-runs/${testRunId}/custom-check-results`, results)
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
};
