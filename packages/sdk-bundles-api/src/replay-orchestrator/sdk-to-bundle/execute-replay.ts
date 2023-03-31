import { ScreenshotDiffOptions } from "@alwaysmeticulous/api";
import { OnBeforeNextEventResult } from "../bundle-to-sdk/execute-replay";

export interface ReplayAndStoreResultsOptions {
  replayTarget: ReplayTarget;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotComparisonOptions;
  generatedBy: GeneratedBy;
  testRunId: string | null;
  suppressScreenshotDiffLogging: boolean;
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  sessionId: string;
  cookiesFile: string | null | undefined;

  /**
   * Called when the user or runner closes the page or browser window
   */
  onClosePage?: () => void;

  /**
   * The replay runner will block on the promise returned before replaying the
   * next event. This allows the caller to pause the replay, or control the playback.
   */
  onBeforeUserEvent?: (
    opts: OnBeforeNextEventOptions
  ) => Promise<OnBeforeNextEventResult>;
}

export interface OnBeforeNextEventOptions {
  /**
   * The index of the next event in sessionData.userEvents.event_log
   */
  userEventIndex: number;
}

/**
 * Similar to ScreenshotAssertionsOptions, but also specifies the test run or base replay id
 * to compare to.
 */
export type ScreenshotComparisonOptions =
  | {
      enabled: false;
    }
  | ScreenshotComparisonEnabledOptions;

export interface ScreenshotComparisonEnabledOptions
  extends ScreenshottingEnabledOptions {
  compareTo: CompareScreenshotsTo;
}

export type CompareScreenshotsTo =
  | CompareScreenshotsToSpecificReplay
  | CompareScreenshotsToTestRun
  | DoNotCompareScreenshots;

export interface CompareScreenshotsToSpecificReplay {
  type: "specific-replay";
  replayId: string;
  diffOptions: ScreenshotDiffOptions;
}

/**
 * Compare to the appropiate 'base-screenshots' of the specified test run.
 *
 * The 'base-screenshots' of a test run are the screenshots that should be
 * used when comparing to the test run as a base. By default the screenshots
 * taken in the replays in that test run are used as the base-screenshots, but if
 * there is a flake then we "don't update the base screenshot", and so re-use
 * the base screenshot from the previous test run.
 */
export interface CompareScreenshotsToTestRun {
  type: "base-screenshots-of-test-run";
  testRunId: string;
  diffOptions: ScreenshotDiffOptions;
}

export interface DoNotCompareScreenshots {
  type: "do-not-compare";
}

export type ReplayTarget =
  | SnapshottedAssetsReplayTarget
  | URLReplayTarget
  | OriginalRecordedURLReplayTarget;

export interface SnapshottedAssetsReplayTarget {
  type: "snapshotted-assets";

  /**
   * If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior replay, instead of against a URL.
   */
  simulationIdForAssets: string;
}

export interface URLReplayTarget {
  type: "url";

  /**
   * If absent, and no URL provided in test case either, then will use the URL the session was recorded against.
   */
  appUrl: string;
}

export interface OriginalRecordedURLReplayTarget {
  type: "original-recorded-url";
}

/**
 * Options that control how a replay is executed.
 */
export interface ReplayExecutionOptions {
  headless: boolean;
  devTools: boolean;
  bypassCSP: boolean;
  shiftTime: boolean;
  networkStubbing: boolean;
  skipPauses: boolean;
  moveBeforeClick: boolean;
  disableRemoteFonts: boolean;
  noSandbox: boolean;
  maxDurationMs: number | null;
  maxEventCount: number | null;

  /**
   * If true disables any features that are non-essential for running tests/executing replays.
   * This includes disabling recording a video of the replay, for playback in the web app.
   *
   * This flag is useful to reduce noise when debugging.
   */
  essentialFeaturesOnly: boolean;
}

export type ReplayOrchestratorScreenshottingOptions =
  | { enabled: false }
  | ScreenshottingEnabledOptions;

export interface ScreenshottingEnabledOptions {
  enabled: true;

  storyboardOptions: StoryboardOptions;
}

export type StoryboardOptions = { enabled: false } | { enabled: true };

export type NotebookRunId = StringId<"NotebookRunId">;
export type TestRunId = StringId<"TestRunId">;

export type GeneratedBy =
  | GeneratedByNotebookRun
  | GeneratedByTestRun
  | GeneratedByReplayCommand;

export interface GeneratedByNotebookRun {
  type: "notebook";
  runId: NotebookRunId;
  runName: string;
  runDate: Date;
  machineHostName: string;
}
export interface GeneratedByTestRun {
  type: "testRun";
  runId: TestRunId;
}

export interface GeneratedByReplayCommand {
  type: "replayCommand";
}

// See https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
// for more details

type StringId<FlavorT> = Flavor<string, FlavorT>;

type Flavor<T, FlavorT> = T & {
  _type?: FlavorT;
};
