import { DetailedTestCaseResult } from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { ParallelTestsReplayOptions } from "./parallel-replay.types";

export interface InitMessage {
  kind: "init";
  data: {
    logLevel: log.LogLevel[keyof log.LogLevel];
    dataDir: string;
    ReplayAndStoreResultsOptions: ParallelTestsReplayOptions;
  };
}

export interface ResultMessage {
  kind: "result";
  data: {
    result: DetailedTestCaseResult;
  };
}
