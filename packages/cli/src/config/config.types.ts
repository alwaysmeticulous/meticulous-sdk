export interface TestCase {
  title: string;
  sessionId: string;
  baseReplayId: string;
}

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}

export interface TestCaseResult extends TestCase {
  headReplayId: string;
  result: "pass" | "fail";
}
