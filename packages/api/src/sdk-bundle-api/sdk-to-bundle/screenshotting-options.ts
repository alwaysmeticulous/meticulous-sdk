/**
 * Differs from ScreenshotComparisonOptions in that
 * ScreenshotComparisonOptions specifies the test run or base replay id
 * to compare to, while ScreenshotAssertionsOptions does not.
 */
export type ScreenshotAssertionsOptions =
  | { enabled: false }
  | ScreenshotAssertionsEnabledOptions;

export interface ScreenshotAssertionsEnabledOptions
  extends ScreenshottingEnabledOptions {
  diffOptions: ScreenshotDiffOptions;
}

export interface ScreenshottingEnabledOptions {
  enabled: true;
  storyboardOptions: StoryboardOptions;
  elementsToIgnore?: ElementToIgnore[];

  waitBeforeScreenshotsMs?: number;
  captureFullPage?: boolean;
  waitForBaseToMatch?: boolean;
}

export declare type StoryboardOptions = { enabled: false } | { enabled: true };

export interface ScreenshotDiffOptions {
  diffThreshold: number;
  diffPixelThreshold: number;
  diffHashesToIgnoreByScreenshotFilename?: Record<string, string[]>;
}

export type ElementToIgnore = CSSSelectorToIgnore;

/**
 * Any elements that match this CSS selector will be hidden/removed before taking a screenshot.
 *
 * The diff will only be shown to the user if the both the original unredacted screenshots differ,
 * and the new redacted screenshots also differ.
 */
export interface CSSSelectorToIgnore {
  type: "css-selector";
  selector: string;
}
