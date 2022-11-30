import { ScreenshotDiffResult, TestCase } from "@alwaysmeticulous/api";

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}

export interface TestCaseResult extends TestCase {
  headReplayId: string;

  /**
   * A test case is marked as a flake if there were screenshot comparison failures,
   * but for every one of those failures regenerating the screenshot on head sometimes gave
   * a different screenshot to the original screenshot taken on head.
   */
  result: "pass" | "fail" | "flake";
}

export interface DetailedTestCaseResult extends TestCaseResult {
  screenshotDiffResults: ScreenshotDiffResult[];
}
