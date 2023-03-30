import { ScreenshotDiffResult } from "@alwaysmeticulous/api";
import {
  GeneratedBy,
  Replay,
  ReplayExecutionOptions,
  ReplayTarget,
  StoryboardOptions,
} from "@alwaysmeticulous/common";
import { loadReplayEventsDependencies } from "@alwaysmeticulous/download-helpers";
import { performReplay } from "@alwaysmeticulous/replay-orchestrator";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
  OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
} from "../../command-utils/common-options";
import {
  ScreenshotAssertionsOptions,
  ScreenshotDiffOptions,
} from "../../command-utils/common-types";

export interface ReplayResult {
  replay: Replay;

  /**
   * Empty if screenshottingOptions.enabled was false.
   */
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}

export interface RawReplayCommandHandlerOptions
  extends ScreenshotDiffOptions,
    Omit<ReplayExecutionOptions, "maxDurationMs" | "maxEventCount">,
    Omit<AdditionalReplayOptions, "baseTestRunId"> {
  screenshot: boolean;
  appUrl: string | null | undefined;
  simulationIdForAssets: string | null | undefined;
  maxDurationMs: number | null | undefined;
  maxEventCount: number | null | undefined;
  storyboard: boolean;
}

interface AdditionalReplayOptions {
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  sessionId: string;
  baseTestRunId: string | null | undefined;
  cookiesFile: string | null | undefined;
  debugger: boolean;
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
  const screenshottingOptions: ScreenshotAssertionsOptions = screenshot
    ? {
        enabled: true,
        diffOptions: { diffPixelThreshold, diffThreshold },
        storyboardOptions,
      }
    : { enabled: false };

  const replayEventsDependencies = await loadReplayEventsDependencies();
  const { replay } = await performReplay({
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
    baseTestRunId: null,
    testRunId: null,
    replayEventsDependencies,
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
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  })
  .handler(async (options) => {
    await rawReplayCommandHandler(options);
  });
