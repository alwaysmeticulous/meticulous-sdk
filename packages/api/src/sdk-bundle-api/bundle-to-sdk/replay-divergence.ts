import type { ScreenshotDiffResult } from "./screenshot-diff-result";

export type DivergenceIndicator =
  | UserEventDivergenceIndicator
  | UrlChangeEventDivergenceIndicator
  | NetworkActivityDivergenceIndicator
  | GraphQLWebSocketActivityDivergenceIndicator
  | InitialNavigationDivergenceIndicator
  | ConsoleErrorDivergenceIndicator;

export interface UserEventDivergenceIndicator {
  type: "user-event";
  beforeEventIdx: number;
  afterEventIdx: number;
}

export interface UrlChangeEventDivergenceIndicator {
  type: "url-change";
  beforeEventIdx?: number;
  afterEventIdx?: number;
}

export interface NetworkActivityDivergenceIndicator {
  type: "network-activity";
  beforeEventIndices?: number[] | undefined;
  afterEventIndices: number[];
  kind: "completed-requests" | "pending-requests";
  /**
   * Head timeline indices attached because a GraphQL-shaped console error
   * pointed at a prior stale stub. Session repair may patch these even when
   * match quality did not degrade vs base.
   */
  graphqlShapedConsoleErrorCauseEventIndices?: number[] | undefined;
  /**
   * Operations inside a batched request that diverged on their own, when the
   * enclosing envelopes could not be paired. Absent for unbatched requests.
   */
  atomicDivergences?: AtomicBatchDivergence[] | undefined;
}

/**
 * A single operation inside a batched request (GraphQL array batch, tRPC batch,
 * Palantir bulk) that diverged between the base and head replays.
 *
 * Envelope-level match quality cannot express this. A client may regroup the
 * same operations into different POST envelopes, so two envelopes carrying
 * different operation sets never pair up and their whole-batch classifications
 * are not comparable — the operations inside them still are.
 */
export interface AtomicBatchDivergence {
  operationName: string;
  /**
   * - `unmatched`: base was served a recorded response for this operation and
   *   head was not.
   * - `dropped`: base asked for this operation and head never did, anywhere in
   *   the replay. An operation that merely moved to a different envelope is not
   *   dropped.
   * - `new`: head asked for an operation base never did, and it went unmatched.
   */
  reason: "unmatched" | "dropped" | "new";
}

/**
 * Indicates that one or more GraphQL-over-websocket subscriptions degraded
 * between the base and head replays (e.g. a subscribe frame that matched a
 * recorded response exactly in the base now only matches by a relaxed strategy,
 * or no longer matches at all). The event indices reference `graphQLWebSocket`
 * timeline entries. Analogous to {@link NetworkActivityDivergenceIndicator} for
 * HTTP requests.
 */
export interface GraphQLWebSocketActivityDivergenceIndicator {
  type: "graphql-websocket-activity";
  beforeEventIndices?: number[] | undefined;
  afterEventIndices: number[];
}

export interface InitialNavigationDivergenceIndicator {
  type: "initial-navigation";
  beforeEventIdx: number;
  afterEventIdx: number;
}

export interface DivergenceConsoleError {
  idx: number;
  /**
   * Truncated to the first 50 characters to avoid sending large payloads
   *
   * Not present in divergences prior to Nov 15, 2024
   */
  truncatedMessage?: string;
  numHeadAppearances: number;
  numBaseAppearances: number;
}

/**
 * Initially we only classified divergences with this indicator based on console error timeline
 * entries, but as of Nov 18, 2024 we also classify divergences with this indicator based on
 * unhandled-window-error and unhandled-promise-rejection timeline events.
 */
export interface ConsoleErrorDivergenceIndicator {
  type: "console-error";
  beforeErrors: DivergenceConsoleError[];
  afterErrors: DivergenceConsoleError[];
}

export interface ScreenshotDivergenceIdentifier {
  filename: string;
  outcome: ScreenshotDiffResult["outcome"];
  virtualTime: number;
}

export interface Divergence {
  /**
   * The type of the first divergence indicator that occurred chronologically.
   */
  reason: "none" | DivergenceIndicator["type"];
  divergenceIndicators: DivergenceIndicator[];
  /**
   * The first diff in the divergence (inclusive).
   */
  startScreenshotDiffId: ScreenshotDivergenceIdentifier;
  /**
   * The last diff in the divergence (inclusive).
   */
  endScreenshotDiffId: ScreenshotDivergenceIdentifier;
  /**
   * The most recent 'no-diff' prior to startScreenshotDiff, if one exists. Note that there could be some
   * missing bases or missing heads etc. between lastMatchingScreenshotDiff and startScreenshotDiff.
   */
  lastMatchingScreenshotDiffId?: ScreenshotDivergenceIdentifier | undefined;
  /**
   * The number of screenshot diffs between startScreenshotDiff and endScreenshotDiff inclusive.
   */
  length: number;
  /**
   * The virtual time of the first divergence indicator that occurred chronologically.
   */
  startTime?: number;
}
