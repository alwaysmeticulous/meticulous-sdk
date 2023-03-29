import {
  TestCaseReplayOptions,
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffOptions,
} from "@alwaysmeticulous/api";
import { ReplayExecutionOptions } from "@alwaysmeticulous/common";
import { performReplay } from "../../replay/perform-replay";
import { hasNotableDifferences } from "../../replay/screenshot-diffing/utils/has-notable-differences";
import { ParallelTestsReplayOptions } from "./parallel-replay.types";
import { DetailedTestCaseResult } from "./utils/config.types";

export const handleReplay = async ({
  testCase,
  replayTarget,
  executionOptions,
  screenshottingOptions,
  apiToken,
  commitSha,
  generatedBy,
  testRunId,
  replayEventsDependencies,
  suppressScreenshotDiffLogging,
  baseTestRunId,
}: ParallelTestsReplayOptions): Promise<DetailedTestCaseResult> => {
  const { replay, screenshotDiffResultsByBaseReplayId } = await performReplay({
    replayTarget,
    executionOptions: applyTestCaseExecutionOptionOverrides(
      executionOptions,
      testCase.options ?? {}
    ),
    screenshottingOptions: applyTestCaseScreenshottingOptionsOverrides(
      screenshottingOptions,
      testCase.options ?? {}
    ),
    apiToken,
    commitSha,
    sessionId: testCase.sessionId,
    baseTestRunId,
    cookiesFile: null,
    generatedBy,
    testRunId,
    replayEventsDependencies,
    suppressScreenshotDiffLogging,
    debugger: false,
  });
  const result = hasNotableDifferences(
    Object.values(screenshotDiffResultsByBaseReplayId).flat()
  )
    ? "fail"
    : "pass";
  return {
    ...testCase,
    headReplayId: replay.id,
    result,
    screenshotDiffResultsByBaseReplayId,
  };
};

const applyTestCaseExecutionOptionOverrides = (
  executionOptionsFromCliFlags: ReplayExecutionOptions,
  overridesFromTestCase: TestCaseReplayOptions
): ReplayExecutionOptions => {
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  return {
    ...executionOptionsFromCliFlags,
    moveBeforeClick:
      overridesFromTestCase.moveBeforeClick ??
      executionOptionsFromCliFlags.moveBeforeClick,
  };
};

const applyTestCaseScreenshottingOptionsOverrides = (
  screenshottingOptionsFromCliFlags: ScreenshotAssertionsEnabledOptions,
  overridesFromTestCase: TestCaseReplayOptions
): ScreenshotAssertionsEnabledOptions => {
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  const diffOptions: ScreenshotDiffOptions = {
    diffThreshold:
      overridesFromTestCase.diffThreshold ??
      screenshottingOptionsFromCliFlags.diffOptions.diffThreshold,
    diffPixelThreshold:
      overridesFromTestCase.diffPixelThreshold ??
      screenshottingOptionsFromCliFlags.diffOptions.diffPixelThreshold,
  };
  return {
    enabled: true,
    diffOptions,
    storyboardOptions: screenshottingOptionsFromCliFlags.storyboardOptions,
  };
};
