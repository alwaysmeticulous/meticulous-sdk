import { ScreenshotDiffResult } from "./screenshot-diff-result";

export type DivergenceIndicator =
  | UserEventDivergenceIndicator
  | UrlChangeEventDivergenceIndicator
  | NetworkActivityDivergenceIndicator
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
