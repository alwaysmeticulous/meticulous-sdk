import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import {
  ReplayExecutionOptions,
  ReplayTarget,
} from "@alwaysmeticulous/common/dist/types/replay.types";
import log from "loglevel";
import {
  applyTestCaseExecutionOptionOverrides,
  applyTestCaseScreenshottingOptionsOverrides,
  ScreenshotAssertionsEnabledOptions,
} from "../command-utils/common-types";
import { replayCommandHandler } from "../commands/replay/replay.command";
import { DiffError } from "../commands/screenshot-diff/screenshot-diff.command";
import { TestCase, TestCaseResult } from "../config/config.types";

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
    cookies: undefined,
    cookiesFile: undefined,
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
  apiToken: string | undefined;
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
