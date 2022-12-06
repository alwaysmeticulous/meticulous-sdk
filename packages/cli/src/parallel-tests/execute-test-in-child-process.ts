import { fork } from "child_process";
import { join } from "path";
import { defer, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { DetailedTestCaseResult } from "../config/config.types";
import { InitMessage, ResultMessage } from "./messages.types";

export const executeTestInChildProcess = (
  initMessage: InitMessage
): Promise<DetailedTestCaseResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const taskHandler = join(__dirname, "task.handler.js");

  const deferredResult = defer<DetailedTestCaseResult>();
  const child = fork(taskHandler, [], { stdio: "inherit" });

  const messageHandler = (message: unknown) => {
    if (
      message &&
      typeof message === "object" &&
      (message as any)["kind"] === "result"
    ) {
      const resultMessage = message as ResultMessage;
      deferredResult.resolve(resultMessage.data.result);
      child.off("message", messageHandler);
    }
  };

  child.on("error", (error) => {
    if (deferredResult.getState() === "pending") {
      deferredResult.reject(error);
    }
  });
  child.on("exit", (code) => {
    if (code) {
      logger.debug(`child exited with code: ${code}`);
    }
    if (deferredResult.getState() === "pending") {
      deferredResult.reject(new Error("No result"));
    }
  });
  child.on("message", messageHandler);

  // Send test case and arguments to child process
  child.send(initMessage);

  return deferredResult.promise;
};
