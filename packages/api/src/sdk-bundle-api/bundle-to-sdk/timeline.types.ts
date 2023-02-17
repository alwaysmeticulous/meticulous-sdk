import { ReplayableEvent } from "../bidirectional/replayable-event";

interface GenericReplayTimelineEntry {
  kind: unknown;

  /**
   * Real start timestamp, using true wall clock time
   */
  start: number;

  /**
   * Real end timestamp, using true wall clock time
   */
  end: number;

  virtualTimeStart?: number;
  virtualTimeEnd?: number;

  data: unknown;
}

export interface ErrorTimelineEntry extends GenericReplayTimelineEntry {
  kind: "error";
  data: {
    message: string;
    fileName: string;
    lineNumber: number;
    stack: string | null;
  };
}

/**
 * An error that cut the replay short.
 */
export interface FatalErrorTimelineEntry extends GenericReplayTimelineEntry {
  kind: "fatalError";
  data: {
    message: string | null;
    stack: string | null;
  };
}

/**
 * Timed out waiting for something but continued anyway. This means the replay was still successful, but may be flakey.
 */
export interface TimeoutTimelineEntry extends GenericReplayTimelineEntry {
  kind: "timeoutError";
  data: {
    timeoutInMs: number;
    message: string | null;
    stack: string | null;
  };
}

export interface FontsTimeoutTimelineEntry extends TimeoutTimelineEntry {
  data: {
    waitedFor: "fonts";
  } & TimeoutTimelineEntry["data"];
}

export interface NetworkResponsesTimeoutTimelineEntry
  extends TimeoutTimelineEntry {
  data: {
    waitedFor: "network-responses";

    /**
     * The urls we timed out waiting for.
     */
    urls?: string[];
  } & TimeoutTimelineEntry["data"];
}

export interface UrlChangeTimelineEntry extends GenericReplayTimelineEntry {
  kind: "urlChange";
  data: {
    url: string;
    timestamp: number;
  };
}

export interface PollyTimelineEntry extends GenericReplayTimelineEntry {
  kind: "pollyReplay";
  data: SuccessfulFindEntryFnEvent | FailedFindEntryFnEvent;
}

export interface SuccessfulFindEntryFnEvent {
  event: "findEntryFn";
  result: "success";
  pollyRequest: unknown;
  matchedRequest: unknown;
}

export interface FailedFindEntryFnEvent {
  event: "findEntryFn";
  result: "failure";
  pollyRequest: unknown;
  matchedRequest: null;
}

export interface JsReplayTimelineEntry extends GenericReplayTimelineEntry {
  kind: "jsReplay";
  data: JsReplayReachedMaxDurationEvent | JsReplaySimulateEvent;
}

export interface JsReplayReachedMaxDurationEvent {
  event: "reached maxDurationMs";
  maxDurationMs: number;
}

export interface JsReplaySimulateEvent {
  event: "simulate";
  userEvent: ReplayableEvent;
  result: "success" | "failed" | "unknownEvent";
}

export type ReplayTimelineEntry =
  | ErrorTimelineEntry
  | FatalErrorTimelineEntry
  | FontsTimeoutTimelineEntry
  | NetworkResponsesTimeoutTimelineEntry
  | UrlChangeTimelineEntry
  | PollyTimelineEntry
  | JsReplayTimelineEntry;

export type ReplayTimelineData = ReplayTimelineEntry[];
