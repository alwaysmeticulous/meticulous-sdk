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
}

export interface InitialNavigationDivergenceIndicator {
  type: "initial-navigation";
  beforeEventIdx: number;
  afterEventIdx: number;
}

export interface DivergenceConsoleError {
  idx: number;
  numHeadAppearances: number;
  numBaseAppearances: number;
}

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
