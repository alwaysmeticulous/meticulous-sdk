export const DEFAULT_MISMATCH_THRESHOLD = 0.01;

// Matches https://github.com/mapbox/pixelmatch/blob/master/index.js#L6
export const DEFAULT_DIFF_PIXEL_THRESHOLD = 0.1;

export const SCREENSHOT_DIFF_OPTIONS = {
  diffThreshold: {
    number: true,
    description:
      "Acceptable maximum proportion of changed pixels, between 0 and 1. If this proportion is exceeded then the test will fail.",
    default: DEFAULT_MISMATCH_THRESHOLD,
  },
  diffPixelThreshold: {
    number: true,
    description:
      "A number between 0 and 1. Color/brightness differences in individual pixels will be ignored if the difference is less than this threshold. A value of 1.0 would accept any difference in color, while a value of 0.0 would accept no difference in color.",
    default: DEFAULT_DIFF_PIXEL_THRESHOLD,
  },
};

export const PRIMARY_COMMON_REPLAY_OPTIONS = {
  apiToken: {
    string: true,
  },
  commitSha: {
    string: true,
  },
};

export const SECONDARY_COMMON_REPLAY_OPTIONS = {
  headless: {
    boolean: true,
    description: "Start browser in headless mode",
  },
  devTools: {
    boolean: true,
    description: "Open Chrome Dev Tools",
  },
  bypassCSP: {
    boolean: true,
    description: "Enables bypass CSP in the browser",
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
};
