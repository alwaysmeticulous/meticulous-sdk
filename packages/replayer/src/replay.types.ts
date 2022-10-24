import { RecordedSession } from "@alwaysmeticulous/common";
// import { ReplayTimelineEntry } from "@alwaysmeticulous/sdk-bundles-api";
import { ConsoleMessageLocation, ConsoleMessageType } from "puppeteer";
import { AssetSnapshotsData } from "./assets/assets.types";

export interface ReplayMetadata {
  session: RecordedSession;
  options: Record<string, any>;
}

export interface PlaybackEvent {
  timestamp: number;
}

export interface ConsoleMessage {
  type: ConsoleMessageType;
  message: string;
  stackTrace: ConsoleMessageLocation[];
}

export interface PageError {
  name?: string;
  message?: string;
  stackTrace?: string;
}

export interface ReplayData {
  assetSnapshotsData: AssetSnapshotsData;
  playbackData: {
    events: PlaybackEvent[];
  };
  logs: {
    console: ConsoleMessage[];
    pageErrors: PageError[];
  };
}

// export type OnReplayTimelineEventFn = (entry: ReplayTimelineEntry) => void;
