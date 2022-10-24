import log from "loglevel";
import {
  CommonReplayOptions,
  ReplayExecutionOptions,
  TestExpectationOptions,
} from "../command-utils/common-types";
import { TestCase, TestCaseResult } from "../config/config.types";

export interface InitMessage {
  kind: "init";
  data: {
    logLevel: log.LogLevel[keyof log.LogLevel];
    dataDir: string;
    runAllOptions: {
      replayExecution: ReplayExecutionOptions;
      testExpectations: TestExpectationOptions;
    } & CommonReplayOptions;
    testCase: TestCase;
    deflake: boolean;
  };
}

export interface ResultMessage {
  kind: "result";
  data: {
    result: TestCaseResult;
  };
}
