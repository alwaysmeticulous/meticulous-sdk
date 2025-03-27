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

  /**
   * The list of events that will actually be replayed. This list is the deduplicated events list,
   * and so may have fewer events than the raw session data (sessionData.userEvents.event_log).
   *
   * These are used for the replay debugger UI.
   */
  eventsBeingReplayed: IndexedReplayableEvent[];

  /**
   * When called will log the target of the given event to the browser console.
   */
  logEventTarget: (event: ReplayableEvent) => Promise<void>;

  /**
   * Closes the browser window and stops the replay short.
   */
  closePage: () => Promise<void>;
}

export interface IndexedReplayableEvent extends ReplayableEvent {
  /**
   * The index of the event in the raw session data, before any events were removed,
   * deduplicated or merged.
   */
  originalEventIndex: number;
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

  /**
   * Indicates that at least one of the screenshots was compared against a replay
   * that was generated with a different Meticulous logic/environment version, or
   * with different project settings.
   *
   * Only present on replays from March 2025 and later.
   */
  comparedAgainstReplayWithDifferentLogicVersion?: boolean;
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
