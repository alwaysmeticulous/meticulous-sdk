/** Result of replaying user interactions */
export type ReplayUserInteractionsResult =
  | ReplayUserInteractionsResultFull
  | ReplayUserInteractionsResultShort
  | ReplayUserInteractionsResultError;

/** Returned when the recorded session has been fully replayed */
export interface ReplayUserInteractionsResultFull {
  length: "full";
}

/** Returned when the recorded session has been cut short during replay */
export interface ReplayUserInteractionsResultShort {
  length: "short";
  reason: "max events" | "max duration";
}

/**
 * Returned when a fatal error was thrown during replay, that cut the replay short
 * (for example the page was navigated while trying to evaluate javascript).
 */
export interface ReplayUserInteractionsResultError {
  length: "short";
  reason: "error";
  error: unknown;
}
