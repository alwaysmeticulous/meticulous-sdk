export interface TestCase {
  sessionId: string;
  baseReplayId: string;
}

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}
