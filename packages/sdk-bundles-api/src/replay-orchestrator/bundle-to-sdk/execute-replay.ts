import {
  Divergence,
  Replay,
  ReplayableEvent,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";

export interface ReplayExecution {
  /**
   * Promise resolves when the replay is complete.
   */
  finalResult: Promise<ReplayAndStoreResultsResult>;

  eventsBeingReplayed: ReplayableEvent[];

  /**
   * When called will log the target of the given event to the browser console.
   */
  logEventTarget: (event: ReplayableEvent) => Promise<void>;

  /**
   * Closes the browser window and stops the replay short.
   */
  closePage: () => Promise<void>;
}

export interface ReplayAndStoreResultsResult {
  replay: Omit<Replay, "project">;

  /**
   * Empty if screenshottingOptions.enabled was false.
   */
  screenshotDiffDataByBaseReplayId: Record<string, ScreenshotDiffData>;

  /**
   * The total number of screenshots taken during the replay.
   * This will be 0 if `screenshottingOptions.enabled` was false.
   */
  totalNumberOfScreenshots: number;

  /**
   * The total number of original source files covered by the replay.
   * This will be 0 if no source maps are being served.
   */
  totalNumberOfSourceFiles: number;

  /**
   * Local directory where the data for this replay is stored.
   */
  replayDir: string;
}

export interface BeforeUserEventResult {
  /**
   * If provided then execution will continue, without calling onBeforeUserEvent, until
   * the next event with this index is reached.
   *
   * If omitted then onBeforeUserEvent will be called again on the immediate next event.
   */
  nextEventIndexToPauseBefore?: number;
}

export interface ScreenshotDiffData {
  results: ScreenshotDiffResult[];
  divergences?: Divergence[];
}
