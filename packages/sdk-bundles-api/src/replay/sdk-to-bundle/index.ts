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
