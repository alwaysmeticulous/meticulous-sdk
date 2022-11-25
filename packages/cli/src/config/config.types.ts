import { ScreenshotDiffResult } from "@alwaysmeticulous/api";
import { ScreenshotDiffOptions } from "../command-utils/common-types";

export interface TestCaseReplayOptions extends Partial<ScreenshotDiffOptions> {
  appUrl?: string | null | undefined;

  /**
   * If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior replay, instead of against a URL.
   */
  simulationIdForAssets?: string | undefined;

  screenshotSelector?: string;

  moveBeforeClick?: boolean;
}

export interface TestCase {
  title: string;
  sessionId: string;
  baseReplayId?: string;
  options?: TestCaseReplayOptions;
}

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}

export interface TestCaseResult extends TestCase {
  headReplayId: string;
  result: "pass" | "fail";
}

export interface DetailedTestCaseResult extends TestCaseResult {
  screenshotDiffResults: ScreenshotDiffResult[];
}
