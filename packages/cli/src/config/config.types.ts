export interface TestCase {
  title: string;
  sessionId: string;
  baseReplayId: string;
}

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}
