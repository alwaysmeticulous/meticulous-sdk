import { Replay, ScreenshotDiffResult } from "@alwaysmeticulous/api";

export interface ReplayAndStoreResultsResult {
  replay: Replay;

  /**
   * Empty if screenshottingOptions.enabled was false.
   */
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}
