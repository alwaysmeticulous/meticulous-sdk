export type DivergenceIndicator =
  | UserEventDivergenceIndicator
  | UrlChangeEventDivergenceIndicator
  | NetworkActivityDivergenceIndicator;

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

export interface ScreenshotDivergenceIdentifier {
  virtualTime: number;
  /**
   * Index of the screenshot diff in ReplayDiff.data.screenshotDiffResults
   */
  idx: number;
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
  lastMatchingScreenshotDiffId: ScreenshotDivergenceIdentifier | undefined;
  /**
   * The number of screenshot diffs between startScreenshotDiff and endScreenshotDiff inclusive.
   */
  length: number;
}
