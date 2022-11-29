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
}: HandleReplayOptions): Promise<DetailedTestCaseResult> => {
  // TODO: Do the upload of the screenshot diffs at the run-all-tests level,
  // and in the rawReplayCommandHandler, and only store the final merged result
  //
  // (also move some of the logging out / add more informative logging)
  const { replay, screenshotDiffResults, screenshotDiffsSummary } =
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
      baseSimulationId: testCase.baseReplayId,
      cookiesFile: null,
      generatedBy,
      testRunId,
      replayEventsDependencies,
    });

  return {
    ...testCase,
    headReplayId: replay.id,
    result: screenshotDiffsSummary.hasDiffs ? "fail" : "pass",
    screenshotDiffResults,
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
  replayEventsDependencies: ReplayEventsDependencies;
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
