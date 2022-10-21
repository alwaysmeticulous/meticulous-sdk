export interface ScreenshotDiffOptions {
  diffThreshold?: number | undefined;
  diffPixelThreshold?: number | undefined;
}

/**
 * Replay options that are re-used by all commands that run a replay,
 * including both commands that run all tests and the replay command
 */
export interface CommonReplayOptions {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  headless?: boolean | null | undefined;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  padTime: boolean;
  shiftTime: boolean;
  networkStubbing: boolean;
  accelerate: boolean;
}

/**
 * Replay options that are re-used by all commands that run a replay,
 * including both commands that run all tests and the replay command
 */
export interface PerReplayOptions {
  appUrl?: string | null | undefined;

  /**
   * If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior replay, instead of against a URL.
   */
  simulationIdForAssets?: string | undefined;

  screenshotSelector?: string;

  cookies?: Record<string, any>[];
}
