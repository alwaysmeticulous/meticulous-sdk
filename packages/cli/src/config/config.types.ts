export interface ReplayOptions {
  screenshotSelector?: string;
  diffThreshold?: number;
  diffPixelThreshold?: number;
  cookies?: Record<string, any>[];
}

export interface TestCase {
  title: string;
  sessionId: string;
  baseReplayId: string;
  options?: ReplayOptions;
}

export interface MeticulousCliConfig {
  testCases?: TestCase[];
}

export interface TestCaseResult extends TestCase {
  headReplayId: string;
  result: "pass" | "fail";
}
