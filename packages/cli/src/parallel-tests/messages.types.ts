import log from "loglevel";
import { TestCaseResult } from "../config/config.types";
import { DeflakeReplayCommandHandlerOptions } from "../deflake-tests/deflake-tests.handler";

export interface InitMessage {
  kind: "init";
  data: {
    logLevel: log.LogLevel[keyof log.LogLevel];
    dataDir: string;
    replayOptions: DeflakeReplayCommandHandlerOptions;
  };
}

export interface ResultMessage {
  kind: "result";
  data: {
    result: TestCaseResult;
  };
}
