import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import {
  CommonReplayOptions,
  ScreenshotDiffOptions,
} from "../command-utils/common-types";
import { replayCommandHandler } from "../commands/replay/replay.command";
import { DiffError } from "../commands/screenshot-diff/screenshot-diff.command";
import { TestCase, TestCaseResult } from "../config/config.types";

const handleReplay: (options: {
  testCase: TestCase;
  options: HandleReplayOptions;
}) => Promise<TestCaseResult> = async ({ testCase, options }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayPromise = replayCommandHandler({
    sessionId: testCase.sessionId,
    baseSimulationId: testCase.baseReplayId,
    screenshot: true,
    save: false,
    exitOnMismatch: false,
    ...testCase.options,
    ...options, // CLI options override testCase options
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
  testCase: TestCase;
  deflake: boolean;
}

interface HandleReplayOptions
  extends CommonReplayOptions,
    ScreenshotDiffOptions {}

export const deflakeReplayCommandHandler: (
  options: DeflakeReplayCommandHandlerOptions
) => Promise<TestCaseResult> = async ({ testCase, deflake, ...options }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const firstResult = await handleReplay({ testCase, options });
  if (firstResult.result === "pass" || !deflake) {
    return firstResult;
  }

  const secondResult = await handleReplay({ testCase, options });
  if (secondResult.result === "fail") {
    return secondResult;
  }

  const thirdResult = await handleReplay({ testCase, options });
  logger.info(`FLAKE: ${thirdResult.title} => ${thirdResult.result}`);
  return thirdResult;
};
