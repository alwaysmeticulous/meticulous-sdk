import {
  ScreenshotDiffResult,
  TestCase,
  TestCaseResult,
} from "@alwaysmeticulous/api";

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}

export interface DetailedTestCaseResult extends TestCaseResult {
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}
