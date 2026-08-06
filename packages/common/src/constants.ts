import type { ScreenshotAssertionsEnabledOptions } from "@alwaysmeticulous/api";
import type { ReplayExecutionOptions } from "@alwaysmeticulous/sdk-bundles-api";

export const BASE_SNIPPETS_URL = "https://snippet.meticulous.ai/";

export const IS_METICULOUS_SUPER_USER = !!process.env["METICULOUS_SUPER_USER"];

export const DEFAULT_EXECUTION_OPTIONS: ReplayExecutionOptions = {
  headless: true,
  devTools: false,
  bypassCSP: false,
  shiftTime: true,
  networkStubbing: true,
  skipPauses: true,
  moveBeforeMouseEvent: true,
  disableRemoteFonts: false,
  noSandbox: false,
  maxDurationMs: 5 * 60 * 1_000, // 5 minutes
  maxEventCount: null,
  essentialFeaturesOnly: false,
  logPossibleNonDeterminism: false,
};

export const DEFAULT_SCREENSHOTTING_OPTIONS: ScreenshotAssertionsEnabledOptions =
  {
    enabled: true,
    storyboardOptions: { enabled: true },
    diffOptions: {
      diffThreshold: 0.00001,
      diffPixelThreshold: 0.01,
    },
  };
