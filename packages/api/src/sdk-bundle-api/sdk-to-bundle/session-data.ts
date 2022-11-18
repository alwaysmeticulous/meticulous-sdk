import { ReplayableEvent } from "../bidirectional/replayable-event";
import { HarLog } from "./har-log";

export interface SessionData {
  userEvents: {
    window: WindowData;
    event_log: ReplayableEvent[];
  };

  pollyHAR: {
    pollyHAR?: { [recordingId: `Meticulous_${string}`]: { log: HarLog } };
  };

  randomEvents: {
    localStorage: {
      state: LocalStorageEntry[];
    };
  };

  cookies: Cookie[];
  urlHistory: UrlHistoryEvent[];
  rrwebEvents: unknown[];
  recording_token: string;
  datetime_first_payload: string;
  hostname: string;
  abandoned: boolean;
}

export interface WindowData {
  startUrl: string;
  width: number;
  height: number;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string | null;
  expires: number | null;
}

export interface UrlHistoryEvent {
  url: string;
  timestamp: number;
}

export type LocalStorageEntry = { key: string; value: string };
