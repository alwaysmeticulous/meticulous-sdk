import {
  NetworkStubbingMode,
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffOptions,
  ScreenshottingEnabledOptions,
} from "@alwaysmeticulous/api";
import { LogLevelNumbers } from "loglevel";
import { BeforeUserEventResult } from "../bundle-to-sdk/execute-replay";

export interface ReplayAndStoreResultsOptions {
  chromeExecutablePath?: string;
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
  logLevel: LogLevelNumbers;

  /**
   * Called when the user or runner closes the page or browser window
   */
  onClosePage?: () => void;

  /**
   * The replay runner will block on the promise returned before replaying the
   * next event. This allows the caller to pause the replay, or control the playback.
   */
  onBeforeUserEvent?: (
    opts: BeforeUserEventOptions
  ) => Promise<BeforeUserEventResult>;

  /**
   * The maximum version of the replayAndStoreResults schema (the types in this inferface
   * and the return type) that the caller is compatible with.
   *
   * This version number is bumped on every API change, and allows the replayAndStoreResults
   * code to detect if it's being called by client that is not compatible with the latest version,
   * and if so throw an OutOfDateClientError. It is then up to the client to display a message to ask
   * the user to update to a newer version.
   *
   * Note: this is typed as a const of the latest known version, rather than a number, to ensure
   * that all clients bump the version number passed when they upgrade to the types.
   */
  maxSemanticVersionSupported: 1;

  /**
   * The version of the environment in which a replay is executed. This should be bumped
   * whenever the environment changes in a way that affects the replay, e.g. the version of
   * Chromium, or the version of Puppeteer.
   */
  logicalEnvironmentVersion?: number;
}

export interface BeforeUserEventOptions {
  /**
   * The index of the next event in sessionData.userEvents.event_log
   */
  userEventIndex: number;
}

/**
 * See {@link ReplayAndStoreResultsOptions.maxSemanticVersionSupported} for more details.
 */
export interface OutOfDateClientError extends Error {
  name: "OutOfDateClient";
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

  /**
   * Defaults to {@link StubAllRequests}
   *
   * networkStubbing must be true if networkStubbingMode is set.
   */
  networkStubbingMode?: NetworkStubbingMode;

  skipPauses: boolean;
  moveBeforeClick: boolean;
  disableRemoteFonts: boolean;
  noSandbox: boolean;
  /**
   * Despite the naming, logPossibleNonDeterminism does actually change how a replay executes.
   * The purpose is logging, but the implementation of how that logging happens changes the way a replay executes in a substantial way.
   */
  logPossibleNonDeterminism: boolean;
  maxDurationMs: number | null;
  maxEventCount: number | null;

  /**
   * If true disables any features that are non-essential for running tests/executing replays.
   * This includes disabling recording a video of the replay, for playback in the web app.
   *
   * This flag is useful to reduce noise when debugging.
   */
  essentialFeaturesOnly: boolean;

  vercel?: VercelExecutionSettings;

  /**
   * If populated, each header will be injected to all requests when fetching resources during a replay.
   */
  customRequestHeaders?: Record<string, string>;
}

export interface VercelExecutionSettings {
  /**
   * The protection bypass token to pass as a 'x-vercel-protection-bypass' header when downloading
   * resources from a deployment URL with SSO or password protection enabled.
   *
   * https://vercel.com/docs/security/deployment-protection#protection-bypass-for-automation
   */
  deploymentProtectionBypassToken: string | null;
}

export type ReplayOrchestratorScreenshottingOptions =
  | { enabled: false }
  | Omit<ScreenshotAssertionsEnabledOptions, "diffOptions">;

export type NotebookRunId = StringId<"notebookRunId">;
export type TestRunId = StringId<"testRunId">;

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
