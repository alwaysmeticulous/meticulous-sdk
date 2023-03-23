import { SessionData, SDKReplayTimelineEntry } from "@alwaysmeticulous/api";
import type { LogLevelDesc } from "loglevel";
import type { Page } from "puppeteer";
import {
  BeforeUserEventOptions,
  ReplayUserInteractionsResult,
} from "../bundle-to-sdk";

export interface ReplayUserInteractionsOptions {
  /**
   * A semantic version number for the SDK calling into the replay code.
   *
   * This version number is bumped on every API change, and allows the replay
   * code to detect if it's being called by an old version, and if so throw
   * and request the user updates to a newer version.
   */
  sdkSemanticVersion: number;
  page: Page;
  sessionData: unknown;
  moveBeforeClick: boolean;
  virtualTime?: VirtualTimeOptions;
  maxDurationMs?: number;
  maxEventCount?: number;
  sessionDurationMs: number;
  logLevel: LogLevelDesc;

  screenshots: ScreenshottingOptions;

  onTimelineEvent: OnReplayTimelineEventFn;

  /**
   * If present then will be called before executing each next user event,
   * and will wait for the completion of the returned promise before continuing.
   */
  onBeforeUserEvent?: OnBeforeUserEventFn;
}

export interface ScreenshottingOptions {
  screenshotsDirectory: string;
  takeIntermediateScreenshots: boolean;
  takeEndStateScreenshot: boolean;
}

/** Replay function for user interaction events */
export type ReplayUserInteractionsFn = (
  options: ReplayUserInteractionsOptions
) => Promise<ReplayUserInteractionsResult>;

export interface BootstrapReplayUserInteractionsOptions {
  page: Page;
  logLevel: LogLevelDesc;
}

export type BootstrapReplayUserInteractionsFn = (
  options: BootstrapReplayUserInteractionsOptions
) => Promise<ReplayUserInteractionsFn>;

// In future we intend to add new options, but only to the enabled: true case
// (for example we'll add an optional 'recreatePauses' option)
export type VirtualTimeOptions = { enabled: false } | { enabled: true };

export type OnReplayTimelineEventFn = (entry: SDKReplayTimelineEntry) => void;

export type OnBeforeUserEventFn = (
  options: BeforeUserEventOptions
) => Promise<void>;

export interface NetworkStubbingOptions {
  page: Page;
  logLevel: LogLevelDesc;
  sessionData: SessionData;
  startUrl: string;
  originalSessionStartUrl: string;
  onTimelineEvent: OnReplayTimelineEventFn;
}

export type SetupReplayNetworkStubbingFn = (
  options: NetworkStubbingOptions
) => Promise<void>;

export interface BrowserContextSeedingOptions {
  page: Page;
  sessionData: SessionData;
  startUrl: string;
}

export type SetupBrowserContextSeedingFn = (
  options: BrowserContextSeedingOptions
) => Promise<void>;

export interface InstallVirtualEventLoopOpts {
  /**
   * The start time of the original session in ms since unix epoch (Date.now()).
   *
   * This is used to ensure that the application code thinks it's running at the same
   * time as the original session during replay, to minimize differences vs the original
   * session.
   */
  sessionStartTime: number;
}
