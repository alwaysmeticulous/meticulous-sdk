import { ScreenshotDiffOptions } from "../sdk-bundle-api/sdk-to-bundle/screenshotting-options";

/**
 * Relevance of a session
 */
export enum SessionRelevance {
  IsPrAuthor = "is-pr-author", // Recent session recorded from the author of the PR. This is used to tag sessions before they are executed.
  IsPrAuthorRelevant = "is-pr-author-relevant", // Recent session recorded from the author of the PR, but relevant to the PR
  IsPrAuthorNotRelevant = "is-pr-author-not-relevant", // Recent session recorded from the author of the PR, but not relevant to the PR
  IsRelevantBeta = "is-relevant-beta", // Similar to IsRelevant, but used by beta relevance algorithm for A/B testing and internal evaluation
  IsRelevant = "is-relevant",
  NotRelevant = "not-relevant",
  MaybeRelevant = "maybe-relevant",
}

export const isPrAuthorRelevance = (
  relevance: SessionRelevance | null | undefined,
): boolean => {
  if (!relevance) {
    return false;
  }

  return (
    relevance === SessionRelevance.IsPrAuthor ||
    relevance === SessionRelevance.IsPrAuthorRelevant ||
    relevance === SessionRelevance.IsPrAuthorNotRelevant
  );
};

export interface TestCase {
  sessionId: string;
  relevanceToPR?: SessionRelevance;
  title?: string;
  options?: TestCaseReplayOptions;
}

export interface TestCaseReplayOptions extends Partial<ScreenshotDiffOptions> {
  appUrl?: string | null | undefined;

  /**
   * If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior replay, instead of against a URL.
   */
  simulationIdForAssets?: string | undefined;
}

/**
 * `Scheduled` = the test run has been created, and a cloud replay job has been queued to run it. It will switch to Running soon.
 *
 * `Running` = a worker is actively running the test run.
 *
 * `Failure` = completed, and at least one replay had notable differences - a diff (see has-notable-differences.ts in the main repo)
 *
 * `Success` = completed, and no replays had notable differences (i.e. just no differences, flakes, missing heads, missing bases or different sizes)
 *
 * `ExecutionError` = the test run failed fatally, and didn't complete. To get accurate results it'll need to be re-run. The test run may shortly switch back
 * into 'Running' in this case, if the worker retries it.
 */
export type TestRunStatus =
  | "Scheduled"
  | "Running"
  | "Success"
  | "Failure"
  | "ExecutionError";

/**
 * Execution of a chunk of a test run chunk.
 *
 * The values and their meanings are the same as for {@link TestRunStatus}.
 */
export type TestRunChunkStatus = TestRunStatus;

export type TestCaseResultStatus = "pass" | "fail" | "flake";

export interface TestCaseResult extends TestCase {
  headReplayId: string;

  /**
   * A test case is marked as a failure if at least one screenshot had a reproducible (no flakey) difference.
   *
   * A test case is marked as a flake if there were differences but all differences were flakey/non-reproducible.
   *
   * Otherwise a test case is marked as a pass: all screenshots had no differences and no flakes.
   */
  result: TestCaseResultStatus;
}
