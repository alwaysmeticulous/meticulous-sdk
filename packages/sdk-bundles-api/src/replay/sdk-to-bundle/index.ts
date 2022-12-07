import { SessionData, ReplayTimelineEntry } from "@alwaysmeticulous/api";
import type { LogLevelDesc } from "loglevel";
import type { Page } from "puppeteer";
import {
  BeforeUserEventOptions,
  ReplayUserInteractionsResult,
} from "../bundle-to-sdk";

export interface ReplayUserInteractionsOptions {
  page: Page;
  sessionData: unknown;
  moveBeforeClick: boolean;
  virtualTime?: VirtualTimeOptions;
  storyboard?: StoryboardOptions;
  maxDurationMs?: number;
  maxEventCount?: number;
  sessionDurationMs?: number;
  logLevel: LogLevelDesc;

  onTimelineEvent: OnReplayTimelineEventFn;

  /**
   * If present then will be called before executing each next user event,
   * and will wait for the completion of the returned promise before continuing.
   */
  onBeforeUserEvent?: OnBeforeUserEventFn;
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

/** Options for capturing a storyboard made of screenshots during replay */
export type StoryboardOptions =
  | { enabled: false }
  | { enabled: true; screenshotsDir: string };

export type OnReplayTimelineEventFn = (entry: ReplayTimelineEntry) => void;

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
