import log from "loglevel";
import { ParallelTestsReplayOptions } from "./parallel-replay.types";
import { DetailedTestCaseResult } from "@alwaysmeticulous/sdk-bundles-api";

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
