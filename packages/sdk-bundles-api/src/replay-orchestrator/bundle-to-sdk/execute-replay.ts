import {
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
  replay: Replay;

  /**
   * Empty if screenshottingOptions.enabled was false.
   */
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}

export interface OnBeforeNextEventResult {
  /**
   * If provided then execution will continue, without calling onBeforeUserEvent, until
   * the next event with this index is reached.
   *
   * If omitted then onBeforeUserEvent will be called again on the immediate next event.
   */
  nextEventIndexToPauseBefore?: number;
}
