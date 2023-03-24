import log from "loglevel";
import { DetailedTestCaseResult } from "../config/config.types";
import { ParallelTestsReplayOptions } from "./parallel-replay.types";

export interface InitMessage {
  kind: "init";
  data: {
    logLevel: log.LogLevel[keyof log.LogLevel];
    dataDir: string;
    replayOptions: ParallelTestsReplayOptions;
  };
}

export interface ResultMessage {
  kind: "result";
  data: {
    result: DetailedTestCaseResult;
  };
}
