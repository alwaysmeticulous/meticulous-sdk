import {
  PerReplayOptions,
  ScreenshotDiffOptions,
} from "../command-utils/common-types";

export interface TestCaseReplayOptions
  extends Partial<PerReplayOptions>,
    ScreenshotDiffOptions {
  moveBeforeClick?: boolean;
}

export interface TestCase {
  title: string;
  sessionId: string;
  baseReplayId: string;
  options?: TestCaseReplayOptions;
}

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}

export interface TestCaseResult extends TestCase {
  headReplayId: string;
  result: "pass" | "fail";
}
