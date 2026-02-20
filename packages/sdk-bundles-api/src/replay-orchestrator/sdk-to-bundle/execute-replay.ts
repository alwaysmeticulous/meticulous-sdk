import {
  Cookie,
  CompanionAssetsInfo,
  InjectableRequestHeader,
  NetworkStubbingMode,
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffOptions,
  ScreenshottingEnabledOptions,
  StorageEntry,
} from "@alwaysmeticulous/api";
import { BeforeUserEventResult } from "../bundle-to-sdk/execute-replay";
import { LogLevelNumbers } from "./loglevel";

export interface ReplayAndStoreResultsOptions {
  chromeExecutablePath?: string;
  replayTarget: ReplayTarget;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotComparisonOptions;
  generatedBy: GeneratedBy;
  testRunId: string | null;
  suppressScreenshotDiffLogging: boolean;

  /**
   * @deprecated Use `simulationProxyUrl` instead.
   */
  disableAssetCache?: boolean;
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;

  /**
   * The git ref used if there was one e.g. refs/head/master
   */
  gitRef: string | null | undefined;

  /**
   * The commit date in ISO 8601 format (e.g., "2025-01-15T10:30:00Z")
   */
  commitDate: string | null | undefined;

  /**
   * True only in case the performance data associated with this replay is
   * significant to benchmark the performance of the application.
   */
  isBenchmarkableReplay: boolean | null | undefined;

  projectId: string;
  sessionId: string;
  /**
   * The ID of the session to use for seeding the application state (cookies, local storage, session storage),
   * during the replay. If undefined, the application state will be seeded from the session under simulation.
   */
  sessionIdForApplicationStorage?: string | null;
  cookiesFile: string | null | undefined;
  logLevel: LogLevelNumbers;

  /**
   * The retry number for this replay. 0 for the initial attempt, 1 for the first retry, etc.
   */
  retryNumber?: number;

  /**
   * Called when the user or runner closes the page or browser window
   */
  onClosePage?: () => void;

  /**
   * The replay runner will block on the promise returned before replaying the
   * next event. This allows the caller to pause the replay, or control the playback.
   */
  onBeforeUserEvent?: (
    opts: BeforeUserEventOptions,
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

  /**
   * If present, requests for assets during simulation will be proxied through this URL
   */
  simulationProxyUrl?: string;

  /**
   * If set to true, capture snapshots of assets.
   */
  snapshotAssets?: boolean;

  /**
   * If present, contains the result of the pre-navigation step.
   */
  preNavigationResult?: PreNavigationResult;
}

export interface PreNavigationResult {
  cookies: Cookie[];
}

export interface BeforeUserEventOptions {
  /**
   * The index of the next event in the `eventsBeingReplayed` list returned on the ReplayExecution
   * object returned by `replayAndStoreResults`.
   *
   * Note that this list is the deduplicated events list, and so may have fewer events than the
   * raw session data (sessionData.userEvents.event_log).
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

export interface ScreenshotComparisonEnabledOptions extends ScreenshottingEnabledOptions {
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
  | OriginalRecordedURLReplayTarget
  | UploadedAssetsReplayTarget
  | UploadedContainerReplayTarget;

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

export interface UploadedAssetsReplayTarget {
  type: "uploaded-assets";
  deploymentUploadId: string;
}

export interface UploadedContainerReplayTarget {
  type: "uploaded-container";
  containerUploadId: string;
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
  moveBeforeMouseEvent: boolean;
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

  /**
   * If populated, each header will be injected into all requests when fetching resources during a replay.
   */
  customRequestHeaders?: InjectableRequestHeader[];

  /**
   * If populated, a list of additional CSS rules to inject into the page when replaying.
   */
  customStyleOverrides?: string[];

  /**
   * Extra cookies to use during the replay. These will override cookies of the same name from the session under simulation.
   */
  extraCookies?: Cookie[];

  extraLocalStorageEntries?: StorageEntryOverride[];

  extraSessionStorageEntries?: StorageEntryOverride[];

  /**
   * Hash of the project settings at the time the test run or replay was initiated. Used as part of `ReplayLogicVersion`
   * to ensure that we don't compare screenshots that were generated from replays with different project settings.
   */
  projectSettingsHash?: string;

  delayLayoutTriggeredEvents?: boolean;

  /**
   * If true deletes window.Worker (pretends the browser doesn't support web workers).
   */
  disableWebWorkers?: boolean;

  /**
   * If true deletes window.SharedWorker (pretends the browser doesn't support shared workers).
   */
  disableSharedWorkers?: boolean;

  /**
   * If true disables the rrweb recorder.
   */
  disableRrweb?: boolean;

  appUrlConfig?: AppUrlConfig;

  /**
   * If true records CSS coverage for the replay.
   */
  enableCssCoverage?: boolean;

  networkDebuggingOptions?: NetworkDebuggingOptions;

  companionAssetsInfo?: CompanionAssetsInfo;

  uploadedContainerPort?: number;
}

export interface StorageEntryOverride extends StorageEntry {
  /**
   * If true, the entry will not be added if it already exists in the session.
   *
   * If false or omitted the entry will be overridden if it already exists in the session.
   */
  ignoreIfEntryAlreadyExists?: true;
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

export interface AppUrlConfig {
  /**
   * If set, we will ensure that the appUrl pathname is prefixed with this value for the initial navigation.
   *
   * __Note:__ When checking if the appUrl is already prefixed, we check against {@link URL.pathname} which
   * will always have a leading "/".
   */
  pathnamePrefix?: string;

  /**
   * Normally if an app URL includes a path, query or hash component then we completely ignore
   * the session start URL (and the provided {@link pathnamePrefix}) and just use the app URL.
   *
   * Setting ignoreAppUrlPathAfterPreNavigation to true overrides this behaviour and use the path, query and hash from the
   * session start URL, and the hostname/origin from the app URL. Thereby completely ignoring the path, query
   * and hash from the app URL.
   *
   * Note: The original full app URL (with path, query and hash) is still used for pre-navigation
   * if pre-navigation (navigating to a URL to get cookies before starting the main replay) is enabled.
   */
  ignoreAppUrlPathAfterPreNavigation?: boolean;
}

export interface NetworkDebuggingOptions {
  requestRegexes: string[];
  transformationsFns: string[];
  requestTypes: ("original-recorded-request" | "request-to-match")[];
  websocketUrlRegexes: string[];
}

// See https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
// for more details

type StringId<FlavorT> = Flavor<string, FlavorT>;

type Flavor<T, FlavorT> = T & {
  _type?: FlavorT;
};
