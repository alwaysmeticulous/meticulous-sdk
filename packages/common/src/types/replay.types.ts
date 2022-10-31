import { RecordedSession, SessionData } from "./session.types";

export interface ReplayEventsDependency<Key extends string> {
  key: Key;
  location: string;
}

export interface BaseReplayEventsDependencies {
  [key: ReplayEventsDependency<string>["key"]]: ReplayEventsDependency<string>;
}

export interface ReplayEventsDependencies extends BaseReplayEventsDependencies {
  browserUserInteractions: ReplayEventsDependency<"browserUserInteractions">;
  browserPlayback: ReplayEventsDependency<"browserPlayback">;
  browserUrlObserver: ReplayEventsDependency<"browserUrlObserver">;
  nodeBrowserContext: ReplayEventsDependency<"nodeBrowserContext">;
  nodeNetworkStubbing: ReplayEventsDependency<"nodeNetworkStubbing">;
  nodeUserInteractions: ReplayEventsDependency<"nodeUserInteractions">;
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
  padTime: boolean;
  shiftTime: boolean;
  networkStubbing: boolean;
  skipPauses: boolean;
  moveBeforeClick: boolean;
  maxDurationMs: number | null;
  maxEventCount: number | null;
}

export type ScreenshottingOptions =
  | { enabled: false }
  | ScreenshottingEnabledOptions;

export interface ScreenshottingEnabledOptions {
  enabled: true;

  /**
   * If null will screenshot whole window
   */
  screenshotSelector: string | null;

  storyboardOptions: StoryboardOptions;
}

export type StoryboardOptions = { enabled: false } | { enabled: true };

export interface ReplayEventsOptions {
  /**
   * If null then will use the URL the session was recorded against.
   */
  appUrl: string | null;
  replayExecutionOptions: ReplayExecutionOptions;

  browser: any;
  outputDir: string;
  session: RecordedSession;
  sessionData: SessionData;
  recordingId: string;
  meticulousSha: string;
  verbose?: boolean;
  dependencies: ReplayEventsDependencies;
  screenshottingOptions: ScreenshottingOptions;
  cookiesFile: string | null;
  generatedBy: GeneratedBy;
}

export type ReplayEventsFn = (options: ReplayEventsOptions) => Promise<void>;

export interface Replay {
  id: string;
  [key: string]: any;
}

export type GeneratedBy =
  | GeneratedByNotebookRun
  | GeneratedByTestRun
  | GeneratedByReplayCommand;

interface GeneratedByNotebookRun {
  type: "notebook";
  notebookRunId: string;
  notebookRunName: string;
  notebookRunDate: Date;
  machineHostName: string;
}

interface GeneratedByTestRun {
  type: "testRun";
  testRunId: string;
}

interface GeneratedByReplayCommand {
  type: "replayCommand";
}
