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

export const OPTIONS = {
  apiToken: {
    string: true,
  },
  commitSha: {
    string: true,
  },
  headless: {
    boolean: true,
    description: "Start browser in headless mode",
    default: false,
  },
  devTools: {
    boolean: true,
    description: "Open Chrome Dev Tools",
    default: false,
  },
  bypassCSP: {
    boolean: true,
    description:
      "Enables bypass CSP in the browser (danger: this could mean you tests hit your production backend)",
    default: false,
  },
  padTime: {
    boolean: true,
    description:
      "Pad replay time according to recording duration. Please note this option will be ignored if running with the '--accelerate' option.",
    default: true,
  },
  shiftTime: {
    boolean: true,
    description: "Shift time during simulation to be set as the recording time",
    default: true,
  },
  networkStubbing: {
    boolean: true,
    description: "Stub network requests during replay",
    default: true,
  },
  accelerate: {
    boolean: true,
    description:
      "Fast forward through any pauses to replay as fast as possible. Warning: this option is experimental and may be deprecated",
    default: false,
  },
  moveBeforeClick: {
    boolean: true,
    description: "Simulate mouse movement before clicking",
    default: false,
  },
  diffThreshold: {
    number: true,
    description:
      "Acceptable maximum proportion of changed pixels, between 0 and 1. If this proportion is exceeded then the test will fail.",
    default: 0.01,
  },
  diffPixelThreshold: {
    number: true,
    description:
      "A number between 0 and 1. Color/brightness differences in individual pixels will be ignored if the difference is less than this threshold. A value of 1.0 would accept any difference in color, while a value of 0.0 would accept no difference in color.",
    default: 0.1, // matches https://github.com/mapbox/pixelmatch/blob/master/index.js#L6
  },
};

export const SCREENSHOT_DIFF_OPTIONS = {
  diffThreshold: OPTIONS.diffThreshold,
  diffPixelThreshold: OPTIONS.diffPixelThreshold,
};

/**
 * Options that are passed onto replayEvents, that are shared by the replay, run-all-tests, and create-test commands
 */
export const COMMON_REPLAY_OPTIONS = {
  headless: OPTIONS.headless,
  devTools: OPTIONS.devTools,
  bypassCSP: OPTIONS.bypassCSP,
  padTime: OPTIONS.padTime,
  shiftTime: OPTIONS.shiftTime,
  networkStubbing: OPTIONS.networkStubbing,
  accelerate: OPTIONS.accelerate,
};