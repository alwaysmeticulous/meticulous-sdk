import { TestCaseReplayOptions } from "../config/config.types";
import { ReplayExecutionOptions } from "@alwaysmeticulous/common";
import defaults from "lodash/defaults";
import { ReplayTarget } from "@alwaysmeticulous/common/dist/types/replay.types";

export interface ScreenshotDiffOptions {
  diffThreshold: number;
  diffPixelThreshold: number;
}

/**
 * Replay options that are re-used by all commands that run a replay,
 * including both commands that run all tests and the replay command
 */
export interface CommonReplayOptions {
  apiToken: string | undefined;
  commitSha: string | undefined;
}

/**
 * Options that affect how test expectations are evaluated
 */
export interface TestExpectationOptions {
  screenshotDiffs: ScreenshotDiffOptions;
  screenshotSelector: string | undefined;
}

export const getReplayTarget = ({
  appUrl,
  simulationIdForAssets,
}: {
  appUrl?: string | undefined;
  simulationIdForAssets?: string | undefined;
}): ReplayTarget => {
  if (simulationIdForAssets) {
    return { type: "snapshotted-assets", simulationIdForAssets };
  }
  if (appUrl) {
    return { type: "url", appUrl };
  }
  return { type: "original-recorded-url" };
};

export const applyTestCaseExecutionOptionOverrides = (
  executionOptionsFromCliFlags: ReplayExecutionOptions,
  overridesFromTestCase: TestCaseReplayOptions
) => {
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  return defaults(
    {},
    {
      moveBeforeClick: overridesFromTestCase.moveBeforeClick,
      simulationIdForAssets: overridesFromTestCase.simulationIdForAssets,
    },
    executionOptionsFromCliFlags
  );
};

export const applyTestCaseExpectationOptionsOverrides = (
  expectationOptionsFromCliFlags: TestExpectationOptions,
  overridesFromTestCase: TestCaseReplayOptions
): TestExpectationOptions => {
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  const screenshotDiffs: ScreenshotDiffOptions = defaults(
    {},
    {
      diffThreshold: overridesFromTestCase.diffThreshold,
      diffPixelThreshold: overridesFromTestCase.diffPixelThreshold,
    },
    expectationOptionsFromCliFlags.screenshotDiffs
  );
  return {
    screenshotDiffs,
    screenshotSelector:
      overridesFromTestCase.screenshotSelector ??
      expectationOptionsFromCliFlags.screenshotSelector,
  };
};
