export type SingleTryScreenshotDiffResult =
  | ScreenshotDiffResultMissingBase
  | ScreenshotDiffResultMissingHead
  | ScreenshotDiffResultDifferentSize
  | ScreenshotDiffResultCompared;

/** Represents the result of comparing two screenshots */
export type ScreenshotDiffResult = {
  identifier: ScreenshotIdentifier;
} & (SingleTryScreenshotDiffResult | ScreenshotDiffResultFlake);

export type ScreenshotIdentifier = EndStateScreenshot | ScreenshotAfterEvent;

export interface LogicVersioned {
  /**
   * The version of the logic and environment used to generate the screenshot. This should be bumped
   * whenever the Meticulous code changes such that two screenshots on different logic versions
   * are incomparable or the replay environment differs. This field is used to avoid falsely flagging a
   * diff to our users when the logic to generate a screenshot or execute a replay changes, or if
   * the replay environment changes, e.g. the browser or Puppeteer versions changes.
   */
  logicVersion?: number;
}

export interface EndStateScreenshot extends LogicVersioned {
  type: "end-state";
}

export interface ScreenshotAfterEvent extends LogicVersioned {
  type: "after-event";

  /** 0 indexed */
  eventNumber: number;
}

export interface ScreenshotDiffResultMissingBase {
  outcome: "missing-base";

  /** Relative path to the replay archive */
  headScreenshotFile: string;
}

export interface ScreenshotDiffResultMissingHead {
  outcome: "missing-head";

  /** Relative path to the replay archive */
  baseScreenshotFile: string;
}

export interface ScreenshotDiffResultMissingBaseAndHead {
  outcome: "missing-base-and-head";
}

export interface ScreenshotDiffResultDifferentSize {
  outcome: "different-size";

  /** Relative path to the replay archive */
  headScreenshotFile: string;

  /** Relative path to the replay archive */
  baseScreenshotFile: string;

  baseWidth: number;
  baseHeight: number;
  headWidth: number;
  headHeight: number;
}

export interface ScreenshotDiffResultCompared {
  outcome: "no-diff" | "diff";

  /** Relative path to the replay archive */
  headScreenshotFile: string;

  /** Relative path to the replay archive */
  baseScreenshotFile: string;

  width: number;
  height: number;
  mismatchPixels: number;
  mismatchFraction: number;
}

/**
 * The base screenshot differed from the head screenshot, but when the head
 * screenshot was retaken one or more additional times at least one of those
 * new head screenshots differed from the first head screenshot.
 */
export interface ScreenshotDiffResultFlake {
  outcome: "flake";

  /**
   * The original diff. Can be any outcome.
   */
  diffToBaseScreenshot: SingleTryScreenshotDiffResult;

  /**
   * The diffs created by retrying taking the head screenshot and comparing
   * it to the original head screenshot. At least one of these will have an
   * outcome other than no-diff, hence why this failure is marked as a flake.
   *
   * Note that in the context of these diffs base means the original head screenshot taken,
   * and head means the new head screenshot taken.
   */
  diffsToHeadScreenshotOnRetries: Array<
    SingleTryScreenshotDiffResult | ScreenshotDiffResultMissingBaseAndHead
  >;
}
