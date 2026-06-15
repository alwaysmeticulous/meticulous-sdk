/**
 * Differs from ScreenshotComparisonOptions in that
 * ScreenshotComparisonOptions specifies the test run or base replay id
 * to compare to, while ScreenshotAssertionsOptions does not.
 */
export type ScreenshotAssertionsOptions =
  | { enabled: false }
  | ScreenshotAssertionsEnabledOptions;

export interface ScreenshotAssertionsEnabledOptions extends ScreenshottingEnabledOptions {
  diffOptions: ScreenshotDiffOptions;
}

export interface ScreenshottingEnabledOptions {
  enabled: true;
  storyboardOptions: StoryboardOptions;
  elementsToIgnore?: ElementToIgnore[];

  waitBeforeScreenshotsMs?: number;
  captureFullPage?: boolean;

  /**
   * Configuration for capturing additional ("auxiliary") screenshots at
   * different viewport sizes during replay. For each configured range, an
   * auxiliary screenshot is captured at its representative viewport whenever
   * the current viewport width does not already fall into that range.
   */
  auxiliaryViewportScreenshots?: AuxiliaryViewportScreenshotRange[];
}

/**
 * A range of screen widths together with the representative viewport size at
 * which an auxiliary screenshot should be captured for that range.
 */
export interface AuxiliaryViewportScreenshotRange {
  /** Inclusive lower bound of the screen-width range this entry represents. */
  minWidth: number;

  /** Inclusive upper bound of the screen-width range this entry represents. */
  maxWidth: number;

  /** Width of the representative viewport to screenshot at for this range. */
  viewportWidth: number;

  /** Height of the representative viewport to screenshot at for this range. */
  viewportHeight: number;
}

export declare type StoryboardOptions = { enabled: false } | { enabled: true };

export interface ScreenshotDiffOptions {
  diffThreshold: number;
  diffPixelThreshold: number;
  diffHashesToIgnoreByScreenshotFilename?: Record<string, string[]>;
  shouldUseRedactedScreenshotByScreenshotFilename?: Record<string, boolean>;
}

export type ElementToIgnore = CSSSelectorToIgnore;

/**
 * Controls in which contexts a matched element is hidden. Named for where it is hidden.
 * Defaults to "replay-and-diff".
 *
 * The element is always hidden for the diff screenshot used in comparison — that is what makes
 * it "ignored". The mode controls whether it is *additionally* hidden during the replay itself
 * and in the user-facing screenshot:
 *
 * - "diff-only": hidden only for the diff screenshot. The element stays present and interactive
 *   throughout the replay and is visible in the user-facing screenshot. Use for content that is
 *   noisy/non-deterministic to diff but whose existence, size and position are stable (so
 *   interacting with it and letting it hold layout is safe).
 * - "replay-and-diff": additionally removed throughout the replay, so it can never be interacted
 *   with and never affects layout, but is still shown in the user-facing screenshot. This is the
 *   default and avoids "shifted diff" flakes from elements that load at inconsistent sizes.
 * - "always": additionally hidden in the user-facing screenshot, so the element is never visible
 *   anywhere.
 */
export type ElementRedactionMode = "always" | "replay-and-diff" | "diff-only";

/**
 * Any elements that match this CSS selector will be hidden/removed before taking a screenshot.
 *
 * The diff will only be shown to the user if the both the original unredacted screenshots differ,
 * and the new redacted screenshots also differ.
 */
export interface CSSSelectorToIgnore {
  type: "css-selector";
  selector: string;
  /**
   * Optional CSS selector for a shadow host element. If specified, the selector will also be
   * searched within the shadow DOM of elements matching this shadow host selector.
   */
  shadowHostSelector?: string;
  comment?: string;
  /**
   * Controls in which contexts the matched element is hidden. Defaults to "replay-and-diff".
   * See {@link ElementRedactionMode}.
   */
  redactionMode?: ElementRedactionMode;
}
