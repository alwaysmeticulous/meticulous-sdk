import {
  ReplayExecutionOptions,
  ReplayTarget,
  ScreenshottingEnabledOptions,
} from "@alwaysmeticulous/common";
import defaults from "lodash/defaults";
import { TestCaseReplayOptions } from "../config/config.types";

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
 * Options for taking a screenshot and comparing it against a previous screenshot
 */
export type ScreenshotAssertionsOptions =
  | { enabled: false }
  | ScreenshotAssertionsEnabledOptions;

export interface ScreenshotAssertionsEnabledOptions
  extends ScreenshottingEnabledOptions {
  diffOptions: ScreenshotDiffOptions;
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

export const applyTestCaseScreenshottingOptionsOverrides = (
  screenshottingOptionsFromCliFlags: ScreenshotAssertionsEnabledOptions,
  overridesFromTestCase: TestCaseReplayOptions
): ScreenshotAssertionsEnabledOptions => {
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  const diffOptions: ScreenshotDiffOptions = defaults(
    {},
    {
      diffThreshold: overridesFromTestCase.diffThreshold,
      diffPixelThreshold: overridesFromTestCase.diffPixelThreshold,
    },
    screenshottingOptionsFromCliFlags.diffOptions
  );
  return {
    enabled: true,
    screenshotSelector:
      overridesFromTestCase.screenshotSelector ??
      screenshottingOptionsFromCliFlags.screenshotSelector,
    diffOptions,
  };
};
