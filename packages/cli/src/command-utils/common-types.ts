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
  diffThreshold: number;
  diffPixelThreshold: number;
}
