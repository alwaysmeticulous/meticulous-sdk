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

  waitBeforeScreenshotsMs?: number;
  captureFullPage?: boolean;
}

export declare type StoryboardOptions = { enabled: false } | { enabled: true };

export interface ScreenshotDiffOptions {
  diffThreshold: number;
  diffPixelThreshold: number;
}
