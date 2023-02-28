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

  requestsBeforeNetworkRecordingStarted?: EarlyRequest[];
  applicationSpecificData?: ApplicationSpecificData;
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
  timestamp: number;

  url: string;

  /**
   * Some frameworks, like next.js expose the router's current URL's pattern e.g. '/projects/[organizationName]/[projectName]'.
   *
   * If so, we include the pattern here.
   */
  urlPattern?: string;
}

export type LocalStorageEntry = { key: string; value: string };

export interface ApplicationSpecificData {
  nextJs?: {
    props?: Record<string, unknown>;
    page?: string;
    query?: Record<string, string>;
    buildId?: string;
    isFallback?: boolean;
    gsp?: boolean;
    scriptLoader?: Record<string, unknown>;
  };
}

export interface EarlyRequest {
  url: string;
  initiatorType: "fetch" | "xmlhttprequest";
  startTime: number;
  duration: number;
}
