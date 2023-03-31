import { ReplayEventsDependencies } from "@alwaysmeticulous/replay-launcher";
import { ReplayAndStoreResultsOptions } from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { TestTaskResult } from "./test-task.types";

export interface InitMessage {
  kind: "init";
  data: {
    logLevel: log.LogLevel[keyof log.LogLevel];
    dataDir: string;
    replayOptions: ReplayAndStoreResultsOptions & {
      replayEventsDependencies: ReplayEventsDependencies;
    };
  };
}

export interface ResultMessage {
  kind: "result";
  data: {
    result: TestTaskResult;
  };
}
