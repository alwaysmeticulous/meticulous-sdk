import { Replay, ScreenshotDiffResult } from "@alwaysmeticulous/api";

export interface ReplayResult {
  replay: Replay;

  /**
   * Empty if screenshottingOptions.enabled was false.
   */
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}
