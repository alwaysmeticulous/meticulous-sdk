import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { Duration } from "luxon";
import { deflakeReplayCommandHandler } from "../deflake-tests/deflake-tests.handler";
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

  const { logLevel, dataDir, runAllOptions, testCase, deflake } =
    initMessage.data;
  logger.setLevel(logLevel);
  getMeticulousLocalDataDir(dataDir);

  const result = await deflakeReplayCommandHandler({
    ...runAllOptions,
    testCase,
    deflake,
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
