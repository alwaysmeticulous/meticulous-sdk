import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import {
  ReplayExecutionOptions,
  ReplayTarget,
} from "@alwaysmeticulous/common/dist/types/replay.types";
import log from "loglevel";
import {
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffOptions,
} from "../command-utils/common-types";
import { replayCommandHandler } from "../commands/replay/replay.command";
import { DiffError } from "../commands/screenshot-diff/screenshot-diff.command";
import {
  TestCase,
  TestCaseReplayOptions,
  TestCaseResult,
} from "../config/config.types";

const handleReplay: (
  options: HandleReplayOptions
) => Promise<TestCaseResult> = async ({
  testCase,
  replayTarget,
  executionOptions,
  screenshottingOptions,
  apiToken,
  commitSha,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayPromise = replayCommandHandler({
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
    save: false,
    exitOnMismatch: false,
    cookiesFile: null,
  });
  const result: TestCaseResult = await replayPromise
    .then(
      (replay) =>
        ({
          ...testCase,
          headReplayId: replay.id,
          result: "pass",
        } as TestCaseResult)
    )
    .catch((error) => {
      if (error instanceof DiffError && error.extras) {
        return {
          ...testCase,
          headReplayId: error.extras.headReplayId,
          result: "fail",
        };
      }
      logger.error(error);
      return { ...testCase, headReplayId: "", result: "fail" };
    });
  return result;
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
}

export const deflakeReplayCommandHandler: (
  options: DeflakeReplayCommandHandlerOptions
) => Promise<TestCaseResult> = async ({ deflake, ...otherOptions }) => {
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
    storyboardOptions: { enabled: false }, // we don't expose this option
  };
};
