export type SingleTryScreenshotDiffResult =
  | ScreenshotDiffResultMissingBase
  | ScreenshotDiffResultMissingHead
  | ScreenshotDiffResultDifferentSize
  | ScreenshotDiffResultNoDifference
  | ScreenshotDiffResultDifference;

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

  /** If unset is normal variant */
  variant?: ScreenshotVariant;
}

export interface ScreenshotAfterEvent extends LogicVersioned {
  type: "after-event";

  /** 0 indexed */
  eventNumber: number;

  /** If unset is normal variant */
  variant?: ScreenshotVariant;
}

/**
 * normal = the original screenshot to be displayed to the user
 * redacted = after injecting CSS `display: hidden` rules for the CSS selectors to ignore
 */
export type ScreenshotVariant = "normal" | "redacted";

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
  /** Relative path to the replay archive */
  headScreenshotFile: string;

  /** Relative path to the replay archive */
  baseScreenshotFile: string;

  /** Relative path to the replay archive */
  diffThumbnailFile?: string;

  /** Relative path to the replay archive */
  diffFullFile?: string;

  width: number;
  height: number;
  mismatchPixels: number;
  mismatchFraction: number;

  /**
   * First 8 characters of the hash of the diff image.
   */
  diffHash?: string;

  /**
   * The result of comparing the redacted screenshots (i.e. screenshots taken after elements
   * to ignore have been hidden/removed).
   *
   * Present only if there were redacted screenshots to compare, or if the original normal
   * screenshots did not differ so there was no need to compare the redacted screenshots.
   */
  redactedScreenshotsComparisonResult?:
    | RedactedScreenshotsCompared
    | RedactedScreenshotIncompatible;
}

export interface ScreenshotDiffResultNoDifference
  extends ScreenshotDiffResultCompared {
  outcome: "no-diff";
}

/**
 * The result of comparing the redacted screenshots. Note that due to thresholds even
 * 'no-diff' results may have some differing pixels.
 */
export interface RedactedScreenshotsCompared {
  /**
   * type may be undefined for old screenshots, from before Feb 2024
   */
  type: "no-diff" | "diff" | undefined;
  mismatchPixels: number;
  mismatchFraction: number;
}

export interface RedactedScreenshotIncompatible {
  type: "missing-base" | "missing-head" | "different-size";
}

export interface ScreenshotDiffResultDifference
  extends ScreenshotDiffResultCompared {
  outcome: "diff";

  /**
   * The hash of the set of all class names within the DOM sections that have differences.
   * This can be useful for grouping together diffs that are caused by the same change.
   */
  hashOfChangedSectionsClassNames?: string;
}

/**
 * The base screenshot differed from the head screenshot, but when the head
 * screenshot was retaken one or more additional times at least one of those
 * new head screenshots differed from the first head screenshot.
 */
export interface ScreenshotDiffResultFlake {
  outcome: "flake";

  evidence?: FlakeEvidence;

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
  diffsToHeadScreenshotOnRetries: ScreenshotDiffRetryResult[];
}

export type FlakeEvidence = "varied-results-on-retry" | "diff-is-known-flake";

export type ScreenshotDiffRetryResult =
  | SingleTryScreenshotDiffRetryResult
  | ScreenshotDiffResultMissingBaseAndHead;

export type SingleTryScreenshotDiffRetryResult = {
  /**
   * Only present on diffs from newer replays.
   */
  headReplayId?: string;
} & SingleTryScreenshotDiffResult;
