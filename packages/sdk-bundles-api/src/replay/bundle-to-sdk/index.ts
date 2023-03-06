/** Result of replaying user interactions */
export type ReplayUserInteractionsResult =
  | ReplayUserInteractionsResultFull
  | ReplayUserInteractionsResultShort;

/** Returned when the recorded session has been fully replayed */
export interface ReplayUserInteractionsResultFull {
  length: "full";
}

/** Returned when the recorded session has been cut short during replay */
export interface ReplayUserInteractionsResultShort {
  length: "short";
  reason: "max events" | "max duration" | "full page navigation";
}

export interface BeforeUserEventOptions {
  /**
   * The index of the next event in sessionData.userEvents.event_log
   */
  userEventIndex: number;
}
