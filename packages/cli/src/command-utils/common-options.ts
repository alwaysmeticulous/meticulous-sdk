// We keep all options that are used by multiple commands in one file.
// This ensures the defaults and descriptions stay in sync. Where we do want
// a different default or description we override it, like:
//
//  headless: {
//    ...COMMON_REPLAY_OPTIONS.headless,
//    default: true,
//  },
//
// This then makes the difference in behaviour explicit

import {
  DEFAULT_EXECUTION_OPTIONS,
  DEFAULT_SCREENSHOTTING_OPTIONS,
  IS_METICULOUS_SUPER_USER,
} from "@alwaysmeticulous/common";

// Used in tips in console output
export const HEADLESS_FLAG = "--headless";

export const OPTIONS = {
  apiToken: {
    string: true,
  },
  commitSha: {
    string: true,
  },
  headless: {
    // Note: when running in CI we default to headless (see DEFAULT_EXECUTION_OPTIONS), but for local runs via the CLI we use headed mode by default
    boolean: true,
    description: "Start browser in headless mode",
    default: false,
  },
  devTools: {
    boolean: true,
    description: "Open Chrome Dev Tools",
    default: DEFAULT_EXECUTION_OPTIONS.devTools,
  },
  bypassCSP: {
    boolean: true,
    description:
      "Enables bypass CSP in the browser (danger: this could mean you tests hit your production backend)",
    default: DEFAULT_EXECUTION_OPTIONS.bypassCSP,
  },
  shiftTime: {
    boolean: true,
    description: "Shift time during simulation to be set as the recording time",
    default: DEFAULT_EXECUTION_OPTIONS.shiftTime,
  },
  networkStubbing: {
    boolean: true,
    description: "Stub network requests during replay",
    default: DEFAULT_EXECUTION_OPTIONS.networkStubbing,
  },
  skipPauses: {
    boolean: true,
    description:
      "Fast forward through any pauses to replay as fast as possible.",
    default: DEFAULT_EXECUTION_OPTIONS.skipPauses,
  },
  moveBeforeMouseEvent: {
    boolean: true,
    description: "Simulate mouse movement before mouse events",
    default: DEFAULT_EXECUTION_OPTIONS.moveBeforeMouseEvent,
  },
  diffThreshold: {
    number: true,
    description:
      "Acceptable maximum proportion of changed pixels, between 0 and 1. If this proportion is exceeded then the test will fail.",
    default: DEFAULT_SCREENSHOTTING_OPTIONS.diffOptions.diffThreshold,
  },
  diffPixelThreshold: {
    number: true,
    description:
      "A number between 0 and 1. Color/brightness differences in individual pixels will be ignored if the difference is less than this threshold. A value of 1.0 would accept any difference in color, while a value of 0.0 would accept no difference in color.",
    default: DEFAULT_SCREENSHOTTING_OPTIONS.diffOptions.diffPixelThreshold,
  },
  disableRemoteFonts: {
    boolean: true,
    description: "Pass the disable remote fonts flag into chromium",
    default: DEFAULT_EXECUTION_OPTIONS.disableRemoteFonts,
  },
  noSandbox: {
    boolean: true,
    description: "Pass the no sandbox flag into chromium",
    default: DEFAULT_EXECUTION_OPTIONS.noSandbox,
  },
  maxDurationMs: {
    // Note: when running in CI we default to 5 minutes (see DEFAULT_EXECUTION_OPTIONS), but for local runs via the CLI we have no default limit
    number: true,
    description: "Maximum duration (in milliseconds) the simulation will run",
  },
  maxEventCount: {
    number: true,
    description: "Maximum number of events the simulation will run",
  },
  storyboard: {
    boolean: true,
    description: "Take a storyboard of screenshots during simulation",
    default: DEFAULT_SCREENSHOTTING_OPTIONS.storyboardOptions.enabled,
  },
  essentialFeaturesOnly: {
    boolean: true,
    description:
      "Disable any features that are non-essential for running tests/executing replays. This includes disabling recording a video of the replay, for playback in the web app. This flag is useful to reduce noise when debugging.",
    default: DEFAULT_EXECUTION_OPTIONS.essentialFeaturesOnly,
  },
  logPossibleNonDeterminism: {
    boolean: true,
    description: "Enable logging of non-determinism events",
    default: DEFAULT_EXECUTION_OPTIONS.logPossibleNonDeterminism,
    hidden: !IS_METICULOUS_SUPER_USER,
  },

  sessionIdForApplicationStorage: {
    string: true,
    description:
      "The ID of the session to use for seeding the application state (cookies, local storage, session storage)",
    hidden: !IS_METICULOUS_SUPER_USER,
  },

  width: {
    number: true,
  },
  height: {
    number: true,
  },
  uploadIntervalMs: {
    number: true,
    description: "Meticulous recording upload interval (in milliseconds)",
  },
  trace: {
    boolean: true,
    description: "Enable verbose logging",
  },
  captureHttpOnlyCookies: {
    boolean: true,
    default: true,
    description: "Capture http-only cookies in addition to regular cookies",
  },
  enableCssCoverage: {
    boolean: true,
    default: false,
    description: "Enable CSS coverage for the replay",
  },
} as const;

export const SCREENSHOT_DIFF_OPTIONS = {
  diffThreshold: OPTIONS.diffThreshold,
  diffPixelThreshold: OPTIONS.diffPixelThreshold,
  storyboard: OPTIONS.storyboard,
};

/**
 * Options that are passed onto launchBrowserAndReplay, that are shared by the replay, run-all-tests, and create-test commands
 */
export const COMMON_REPLAY_OPTIONS = {
  headless: OPTIONS.headless,
  devTools: OPTIONS.devTools,
  bypassCSP: OPTIONS.bypassCSP,
  shiftTime: OPTIONS.shiftTime,
  networkStubbing: OPTIONS.networkStubbing,
  skipPauses: OPTIONS.skipPauses,
  disableRemoteFonts: OPTIONS.disableRemoteFonts,
  noSandbox: OPTIONS.noSandbox,
  maxDurationMs: OPTIONS.maxDurationMs,
  maxEventCount: OPTIONS.maxEventCount,
  essentialFeaturesOnly: OPTIONS.essentialFeaturesOnly,
  logPossibleNonDeterminism: OPTIONS.logPossibleNonDeterminism,
  sessionIdForApplicationStorage: OPTIONS.sessionIdForApplicationStorage,
  enableCssCoverage: OPTIONS.enableCssCoverage,
};

/**
 * Options shared between the `record` and `record-login` commands.
 */
export const COMMON_RECORD_OPTIONS = {
  apiToken: OPTIONS.apiToken,
  devTools: OPTIONS.devTools,
  bypassCSP: OPTIONS.bypassCSP,
  width: OPTIONS.width,
  height: OPTIONS.height,
  uploadIntervalMs: OPTIONS.uploadIntervalMs,
  trace: OPTIONS.trace,
  captureHttpOnlyCookies: OPTIONS.captureHttpOnlyCookies,
  appUrl: {
    description:
      "Will skip straight to starting recording at the provided URL. Advanced option used to accelerate testing. Hidden from help menus.",
    string: true,
    hidden: !IS_METICULOUS_SUPER_USER,
  } as const,
  maxPayloadSize: {
    number: true,
    description: "The maximum payload size for the session",
  } as const,
};
