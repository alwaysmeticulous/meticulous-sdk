import {
  Replay,
  ScreenshotDiffOptions,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import { replayAndStoreResults } from "@alwaysmeticulous/replay-orchestrator";
import {
  GeneratedBy,
  ReplayExecutionOptions,
  ScreenshotComparisonOptions,
  ReplayTarget,
  StoryboardOptions,
} from "@alwaysmeticulous/sdk-bundles-api";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
  OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
} from "../../command-utils/common-options";

export interface ReplayAndStoreResultsResult {
  replay: Replay;

  /**
   * Empty if screenshottingOptions.enabled was false.
   */
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}

export interface RawReplayCommandHandlerOptions
  extends ScreenshotDiffOptions,
    Omit<ReplayExecutionOptions, "maxDurationMs" | "maxEventCount"> {
  screenshot: boolean;
  appUrl: string | null | undefined;
  simulationIdForAssets: string | null | undefined;
  maxDurationMs: number | null | undefined;
  maxEventCount: number | null | undefined;
  storyboard: boolean;
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  sessionId: string;
  cookiesFile: string | null | undefined;
  debugger: boolean;
  baseReplayId: string | null | undefined;
}

export const rawReplayCommandHandler = async ({
  apiToken,
  commitSha,
  sessionId,
  appUrl,
  simulationIdForAssets,
  headless,
  devTools,
  bypassCSP,
  screenshot,
  baseReplayId,
  diffThreshold,
  diffPixelThreshold,
  shiftTime,
  networkStubbing,
  moveBeforeClick,
  cookiesFile,
  disableRemoteFonts,
  noSandbox,
  skipPauses,
  maxDurationMs,
  maxEventCount,
  storyboard,
  essentialFeaturesOnly,
  debugger: enableStepThroughDebugger,
}: RawReplayCommandHandlerOptions): Promise<Replay> => {
  if (screenshot == false && storyboard == true) {
    throw new Error(
      "Cannot take storyboard screenshots without taking end state screenshots. Please set '--screenshot' to true, or '--storyboard' to false."
    );
  }

  const executionOptions: ReplayExecutionOptions = {
    headless,
    devTools,
    bypassCSP,
    shiftTime,
    networkStubbing,
    skipPauses,
    moveBeforeClick,
    disableRemoteFonts,
    noSandbox,
    maxDurationMs: maxDurationMs ?? null,
    maxEventCount: maxEventCount ?? null,
    essentialFeaturesOnly,
  };
  const generatedByOption: GeneratedBy = { type: "replayCommand" };
  const storyboardOptions: StoryboardOptions = storyboard
    ? { enabled: true }
    : { enabled: false };
  const screenshottingOptions: ScreenshotComparisonOptions = screenshot
    ? {
        enabled: true,
        storyboardOptions,
        compareTo:
          baseReplayId != null
            ? {
                type: "specific-replay",
                replayId: baseReplayId,
                diffOptions: { diffThreshold, diffPixelThreshold },
              }
            : {
                type: "do-not-compare",
              },
      }
    : { enabled: false };

  const { replay } = await replayAndStoreResults({
    replayTarget: getReplayTarget({
      appUrl: appUrl ?? null,
      simulationIdForAssets: simulationIdForAssets ?? null,
    }),
    executionOptions,
    screenshottingOptions,
    apiToken,
    commitSha,
    cookiesFile,
    sessionId,
    generatedBy: generatedByOption,
    testRunId: null,
    debugger: enableStepThroughDebugger,
    suppressScreenshotDiffLogging: false,
  });

  return replay;
};

export const getReplayTarget = ({
  appUrl,
  simulationIdForAssets,
}: {
  appUrl: string | null;
  simulationIdForAssets: string | null;
}): ReplayTarget => {
  if (simulationIdForAssets) {
    return { type: "snapshotted-assets", simulationIdForAssets };
  }
  if (appUrl) {
    return { type: "url", appUrl };
  }
  return { type: "original-recorded-url" };
};

export const replayCommand = buildCommand("simulate")
  .details({
    aliases: ["replay"],
    describe: "Simulate (replay) a recorded session",
  })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    sessionId: {
      string: true,
      demandOption: true,
    },
    appUrl: {
      string: true,
      description:
        "The URL to execute the test against. If left absent will use the URL the test was originally recorded against.",
    },
    simulationIdForAssets: {
      string: true,
      conflicts: "appUrl",
      description:
        "If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior simulation, instead of against a URL. An alternative to specifying an app URL.",
    },
    screenshot: {
      boolean: true,
      description: "Take a screenshot at the end of simulation",
      default: true,
    },
    debugger: {
      boolean: true,
      description:
        "Opens a step through debugger to advance through the replay event by event",
      default: false,
    },
    moveBeforeClick: OPTIONS.moveBeforeClick,
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before simulation",
    },
    baseReplayId: {
      string: true,
      description:
        "Base simulation id to diff the final state screenshot against",
      alias: "baseSimulationId",
    },
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  })
  .handler(async (options) => {
    await rawReplayCommandHandler(options);
  });
