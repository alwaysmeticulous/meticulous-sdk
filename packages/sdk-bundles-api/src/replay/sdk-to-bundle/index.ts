import type { LogLevelDesc } from "loglevel";
import type { Page } from "puppeteer";
import { ReplayUserInteractionsResult } from "../bundle-to-sdk";
import { ReplayTimelineEntry } from "./timeline.types";

/** Options for replaying user interaction events */
export interface ReplayUserInteractionsOptions {
  page: Page;
  sessionData: unknown;
  moveBeforeClick: boolean;
  acceleratePlayback: boolean;
  virtualTime: VirtualTimeOptions;
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

export type OnReplayTimelineEventFn = (entry: ReplayTimelineEntry) => void;
