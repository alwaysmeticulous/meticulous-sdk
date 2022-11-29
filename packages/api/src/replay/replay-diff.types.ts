export interface ReplayDiff {
  id: string;
  project: { [key: string]: any };
  headReplay: { [key: string]: any };
  baseReplay: { [key: string]: any };
  testRun: { [key: string]: any };
  data: ReplayDiffData;
  createdAt: string;
  updatedAt: string;
}

export interface ReplayDiffData {
  screenshotAssertionsOptions?: ScreenshotAssertionsOptions;
  screenshotDiffResults?: ScreenshotDiffResult[];
}

export type ScreenshotAssertionsOptions =
  | { enabled: false }
  | ScreenshotAssertionsEnabledOptions;

export interface ScreenshotAssertionsEnabledOptions
  extends ScreenshottingEnabledOptions {
  diffOptions: ScreenshotDiffOptions;
}

export interface ScreenshottingEnabledOptions {
  enabled: true;
  screenshotSelector: string | null;
  storyboardOptions: StoryboardOptions;
}

export declare type StoryboardOptions = { enabled: false } | { enabled: true };

export interface ScreenshotDiffOptions {
  diffThreshold: number;
  diffPixelThreshold: number;
}

/** Represents the result of comparing two screenshots */
export type ScreenshotDiffResult = {
  identifier: ScreenshotIdentifier;
} & (
  | ScreenshotDiffResultMissingBase
  | ScreenshotDiffResultMissingHead
  | ScreenshotDiffResultDifferentSize
  | ScreenshotDiffResultCompared
  | ScreenshotDiffResultFlake
);

export type ScreenshotIdentifier = EndStateScreenshot | ScreenshotAfterEvent;

export interface EndStateScreenshot {
  type: "end-state";
}

export interface ScreenshotAfterEvent {
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

  individualDiffs: Array<Omit<ScreenshotDiffResult, "identifier">>;
}
