export interface ReplayOptions {
  screenshotSelector?: string;
  diffThreshold?: number;
  diffPixelThreshold?: number;
  cookies?: Record<string, any>[];
  moveBeforeClick?: boolean;

  /**
   * If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior replay, instead of against a URL.
   */
  useAssetsFromReplayId?: string;
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
