import { TestCase } from "@alwaysmeticulous/api";
import {
  DetailedTestCaseResult,
  ReplayExecutionOptions,
  ScreenshotComparisonOptions,
  ReplayTarget,
} from "@alwaysmeticulous/sdk-bundles-api";

export interface TestTask {
  title: string | null;

  sessionId: string;

  replayTarget: ReplayTarget;

  executionOptions: ReplayExecutionOptions;

  /**
   * Overrides the screenshotting options in the test case
   */
  screenshottingOptions: ScreenshotComparisonOptions;

  /**
   * The original test case that triggered this task. Note that given
   * there may be retries there may be multiple test tasks for a given originalTestCase,
   * each with different screenshottingOptions (i.e. comparing to different bases).
   */
  originalTestCase: TestCase;

  isRetry: boolean;
}

export type TestTaskResult = Pick<
  DetailedTestCaseResult,
  "result" | "screenshotDiffResultsByBaseReplayId" | "headReplayId"
>;
