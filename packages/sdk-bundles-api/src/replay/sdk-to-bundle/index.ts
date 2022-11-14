import type { LogLevelDesc } from "loglevel";
import type { Page } from "puppeteer";
import { ReplayUserInteractionsResult } from "../bundle-to-sdk";
import { ReplayTimelineEntry } from "./timeline.types";

/** Options for replaying user interaction events */
export interface ReplayUserInteractionsOptions {
  page: Page;
  sessionData: unknown;
  moveBeforeClick: boolean;
  virtualTime?: VirtualTimeOptions;
  storyboard?: StoryboardOptions;
  maxDurationMs?: number;
  maxEventCount?: number;
  sessionDurationMs?: number;
  onTimelineEvent: OnReplayTimelineEventFn;
  logLevel: LogLevelDesc;
}

/** Replay function for user interaction events */
export type ReplayUserInteractionsFn = (
  options: ReplayUserInteractionsOptions
) => Promise<ReplayUserInteractionsResult>;

// In future we intend to add new options, but only to the enabled: true case
// (for example we'll add an optional 'recreatePauses' option)
export type VirtualTimeOptions = { enabled: false } | { enabled: true };

/** Options for capturing a storyboard made of screenshots during replay */
export type StoryboardOptions =
  | { enabled: false }
  | { enabled: true; screenshotsDir: string };

export type OnReplayTimelineEventFn = (entry: ReplayTimelineEntry) => void;

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
