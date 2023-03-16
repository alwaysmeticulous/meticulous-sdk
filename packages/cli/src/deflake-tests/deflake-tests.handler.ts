import { TestCase } from "@alwaysmeticulous/api";
import { TestCaseReplayOptions } from "@alwaysmeticulous/api/dist/replay/test-run.types";
import {
  GeneratedBy,
  METICULOUS_LOGGER_NAME,
  ReplayEventsDependencies,
  ReplayExecutionOptions,
  ReplayTarget,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import {
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffOptions,
} from "../command-utils/common-types";
import { replayCommandHandler } from "../commands/replay/replay.command";
import { hasNotableDifferences } from "../commands/screenshot-diff/utils/has-notable-differences";
import { DetailedTestCaseResult } from "../config/config.types";

const handleReplay = async ({
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
}: HandleReplayOptions): Promise<DetailedTestCaseResult> => {
  const { replay, screenshotDiffResultsByBaseReplayId } =
    await replayCommandHandler({
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
    [...screenshotDiffResultsByBaseReplayId.values()].flat()
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

export interface DeflakeReplayCommandHandlerOptions
  extends HandleReplayOptions {
  deflake: boolean;
}

interface HandleReplayOptions {
  replayTarget: ReplayTarget;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
  testCase: TestCase;
  apiToken: string | null;
  commitSha: string;
  generatedBy: GeneratedBy;
  testRunId: string | null;
  baseTestRunId: string | null;
  replayEventsDependencies: ReplayEventsDependencies;
  suppressScreenshotDiffLogging: boolean;
}

export const deflakeReplayCommandHandler = async ({
  deflake,
  ...otherOptions
}: DeflakeReplayCommandHandlerOptions): Promise<DetailedTestCaseResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const firstResult = await handleReplay(otherOptions);
  if (firstResult.result === "pass" || !deflake) {
    return firstResult;
  }

  const secondResult = await handleReplay(otherOptions);
  if (secondResult.result === "fail") {
    return secondResult;
  }

  const thirdResult = await handleReplay(otherOptions);
  logger.info(`FLAKE: ${thirdResult.title} => ${thirdResult.result}`);
  return thirdResult;
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
    screenshotSelector:
      overridesFromTestCase.screenshotSelector ??
      screenshottingOptionsFromCliFlags.screenshotSelector,
    diffOptions,
    storyboardOptions: screenshottingOptionsFromCliFlags.storyboardOptions,
  };
};
