import log from "loglevel";
import { TestCase, TestCaseResult } from "../config/config.types";

export interface InitMessage {
  kind: "init";
  data: {
    logLevel: log.LogLevel[keyof log.LogLevel];
    dataDir: string;
    runAllOptions: {
      apiToken: string | null | undefined;
      commitSha: string | null | undefined;
      appUrl: string | null | undefined;
      headless: boolean | null | undefined;
      devTools: boolean | null | undefined;
      bypassCSP: boolean | null | undefined;
      diffThreshold: number | null | undefined;
      diffPixelThreshold: number | null | undefined;
      padTime: boolean;
      shiftTime: boolean;
      networkStubbing: boolean;
    };
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
