import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { Duration } from "luxon";
import { replayCommandHandler } from "../commands/replay/replay.command";
import { DiffError } from "../commands/screenshot-diff/screenshot-diff.command";
import { TestCaseResult } from "../config/config.types";
import { initLogger } from "../utils/logger.utils";
import { InitMessage, ResultMessage } from "./messages.types";

const INIT_TIMEOUT = Duration.fromObject({ second: 1 });

const waitForInitMessage: () => Promise<InitMessage> = () => {
  return Promise.race([
    new Promise<InitMessage>((resolve) => {
      const messageHandler = (message: unknown) => {
        if (
          message &&
          typeof message === "object" &&
          (message as any)["kind"] === "init"
        ) {
          const initMessage = message as InitMessage;
          resolve(initMessage);
          process.off("message", messageHandler);
        }
      };

      process.on("message", messageHandler);
    }),
    new Promise<InitMessage>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error("Timed out waiting for init message"));
      }, INIT_TIMEOUT.toMillis());
    }),
  ]);
};

const main = async () => {
  initLogger();
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  if (!process.send) {
    console.error("Error: not started as a child process");
    process.exit(1);
  }

  const initMessage = await waitForInitMessage();

  const { logLevel, dataDir, runAllOptions, testCase } = initMessage.data;
  logger.setLevel(logLevel);
  getMeticulousLocalDataDir(dataDir);

  const {
    apiToken,
    commitSha,
    appUrl,
    headless,
    devTools,
    bypassCSP,
    diffThreshold,
    diffPixelThreshold,
    padTime,
    networkStubbing,
  } = runAllOptions;
  const { sessionId, baseReplayId, options } = testCase;

  const replayPromise = replayCommandHandler({
    apiToken,
    commitSha,
    sessionId,
    appUrl,
    headless,
    devTools,
    bypassCSP,
    screenshot: true,
    baseReplayId,
    diffThreshold,
    diffPixelThreshold,
    save: false,
    exitOnMismatch: false,
    padTime,
    networkStubbing,
    ...options,
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

  const resultMessage: ResultMessage = {
    kind: "result",
    data: {
      result,
    },
  };

  process.send(resultMessage);
  process.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
