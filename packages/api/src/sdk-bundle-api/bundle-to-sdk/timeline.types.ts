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
 * ReplayTimelineEntry types used by Meticulous SDK.
 *
 * The Meticulous BE code internally uses additional timeline entries, but these
 * types are stored seperately.
 */
export type SDKReplayTimelineEntry = FatalErrorTimelineEntry | unknown;

export type SDKReplayTimelineData = SDKReplayTimelineEntry[];
