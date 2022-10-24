import { TestCaseReplayOptions } from "../config/config.types";
import {
  ReplayExecutionOptions,
  ResolvedReplayExecutionOptions,
} from "@alwaysmeticulous/common";
import defaults from "lodash/defaults";

export interface ScreenshotDiffOptions {
  diffThreshold: number;
  diffPixelThreshold: number;
}

/**
 * Replay options that are re-used by all commands that run a replay,
 * including both commands that run all tests and the replay command
 */
export interface CommonReplayOptions {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
}

/**
 * Options that affect how test expectations are evaluated
 */
export interface TestExpectationOptions {
  screenshotDiffs: Partial<ScreenshotDiffOptions>;
  screenshotSelector: string | undefined;
}

export interface ResolvedExpectationOptions {
  screenshotDiffs: ScreenshotDiffOptions;
  screenshotSelector: string | undefined;
}

export const DEFAULT_REPLAY_EXECUTION_OPTIONS: ResolvedReplayExecutionOptions =
  {
    headless: false,
    devTools: false,
    bypassCSP: false,
    padTime: true,
    shiftTime: true,
    networkStubbing: true,
    accelerate: false,
    moveBeforeClick: false,
  };

export const getResolvedExecutionOptions = (
  optionsFromTestCase: TestCaseReplayOptions,
  executionOptionsFromCliFlags: ReplayExecutionOptions
) => {
  const testCaseExecutionOptions = {
    moveBeforeClick: optionsFromTestCase.moveBeforeClick,
    simulationIdForAssets: optionsFromTestCase.simulationIdForAssets,
  };

  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  return defaults(
    {},
    testCaseExecutionOptions,
    executionOptionsFromCliFlags,
    DEFAULT_REPLAY_EXECUTION_OPTIONS
  );
};

export const DEFAULT_SCREENSHOT_DIFF_OPTIONS: ScreenshotDiffOptions = {
  diffThreshold: 0.01,
  diffPixelThreshold: 0.1, // matches https://github.com/mapbox/pixelmatch/blob/master/index.js#L6
};

export const getResolvedExpectationOptions = (
  optionsFromTestCase: TestCaseReplayOptions,
  expectationOptionsFromCliFlags: TestExpectationOptions
): ResolvedExpectationOptions => {
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  const screenshotDiffs: ScreenshotDiffOptions = defaults(
    {},
    {
      diffThreshold: optionsFromTestCase.diffThreshold,
      diffPixelThreshold: optionsFromTestCase.diffPixelThreshold,
    },
    expectationOptionsFromCliFlags.screenshotDiffs,
    DEFAULT_SCREENSHOT_DIFF_OPTIONS
  );
  return {
    screenshotDiffs,
    screenshotSelector:
      expectationOptionsFromCliFlags.screenshotSelector ??
      optionsFromTestCase.screenshotSelector,
  };
};
