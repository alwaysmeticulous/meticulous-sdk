import {
  METICULOUS_LOGGER_NAME,
  setMeticulousLocalDataDir,
} from "@alwaysmeticulous/common";
import { initSentry, SENTRY_FLUSH_TIMEOUT } from "@alwaysmeticulous/sentry";
import * as Sentry from "@sentry/node";
import log from "loglevel";
import { Duration } from "luxon";
import { InitMessage, ResultMessage } from "./messages.types";
import { handleReplay } from "./parallel-replay.handler";

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
  await initSentry();
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  if (!process.send) {
    console.error("Error: not started as a child process");
    process.exit(1);
  }

  const initMessage = await waitForInitMessage();

  const { logLevel, dataDir, replayOptions } = initMessage.data;
  logger.setLevel(logLevel);
  setMeticulousLocalDataDir(dataDir);

  const result = await handleReplay(replayOptions);
  const resultMessage: ResultMessage = {
    kind: "result",
    data: {
      result,
    },
  };

  process.send(resultMessage);
  process.disconnect();

  await Sentry.flush(SENTRY_FLUSH_TIMEOUT.toMillis());
};

main().catch(async (error) => {
  console.error(error);

  Sentry.captureException(error);
  await Sentry.flush(SENTRY_FLUSH_TIMEOUT.toMillis());

  process.exit(1);
});

const initLogger: () => void = () => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.setDefaultLevel(log.levels.INFO);
};
