import log from "loglevel";
import { ScreenshotDiffOptions } from "../command-utils/common-types";
import { CLIOnlyReplayOptions } from "../commands/replay/replay.command";
import { TestCase, TestCaseResult } from "../config/config.types";

export interface InitMessage {
  kind: "init";
  data: {
    logLevel: log.LogLevel[keyof log.LogLevel];
    dataDir: string;
    runAllOptions: CLIOnlyReplayOptions & ScreenshotDiffOptions;
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
