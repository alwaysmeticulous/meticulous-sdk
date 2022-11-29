import { ScreenshotDiffResult, TestCase } from "@alwaysmeticulous/api";

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}

export interface TestCaseResult extends TestCase {
  headReplayId: string;
  result: "pass" | "fail" | "flake";
}

export interface DetailedTestCaseResult extends TestCaseResult {
  screenshotDiffResults: ScreenshotDiffResult[];
}

export interface DetailedTestCaseReRunResult {
  screenshotDiffResults: ScreenshotDiffResult[];
}
