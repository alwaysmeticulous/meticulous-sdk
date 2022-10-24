import { ScreenshottingEnabledOptions } from "@alwaysmeticulous/common";

/**
 * Options for taking a screenshot and comparing it against a previous screenshot
 */
export type ScreenshotAssertionsOptions =
  | { enabled: false }
  | ScreenshotAssertionsEnabledOptions;

export interface ScreenshotAssertionsEnabledOptions
  extends ScreenshottingEnabledOptions {
  diffOptions: ScreenshotDiffOptions;
}

export interface ScreenshotDiffOptions {
  /**
   * Acceptable maximum proportion of changed pixels, between 0 and 1.
   */
  diffThreshold: number;

  /**
   * A number between 0 and 1. Color/brightness differences in individual pixels will be ignored if the difference is less than this threshold. A value of 1.0 would accept any difference in color, while a value of 0.0 would accept no difference in color.
   */
  diffPixelThreshold: number;
}
