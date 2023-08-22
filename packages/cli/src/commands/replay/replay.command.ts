import {
  ScreenshotDiffOptions,
  StoryboardOptions,
} from "@alwaysmeticulous/api";
import { applyDefaultExecutionOptionsFromProject } from "@alwaysmeticulous/client";
import { defer } from "@alwaysmeticulous/common";
import { replayAndStoreResults } from "@alwaysmeticulous/replay-orchestrator-launcher";
import {
  BeforeUserEventOptions,
  BeforeUserEventResult,
  GeneratedBy,
  ReplayExecutionOptions,
  ReplayTarget,
  ScreenshotComparisonOptions,
} from "@alwaysmeticulous/sdk-bundles-api";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
  OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
} from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { openStepThroughDebuggerUI } from "./utils/replay-debugger.ui";

interface ReplayCommandHandlerOptions
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

const replayCommandHandler = async ({
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
  logPossibleNonDeterminism,
  debugger: enableStepThroughDebugger,
}: ReplayCommandHandlerOptions): Promise<void> => {
  if (!screenshot && storyboard) {
    throw new Error(
      "Cannot take storyboard screenshots without taking end state screenshots. Please set '--screenshot' to true, or '--storyboard' to false."
    );
  }

  if (headless && enableStepThroughDebugger) {
    throw new Error(
      "Cannot run with both --debugger flag and --headless flag at the same time."
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
    logPossibleNonDeterminism,
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

  const getOnBeforeUserEventCallback =
    defer<
      (options: BeforeUserEventOptions) => Promise<BeforeUserEventResult>
    >();
  const getOnClosePageCallback = defer<() => Promise<void>>();

  try {
    const replayExecution = await replayAndStoreResults({
      replayTarget: getReplayTarget({
        appUrl: appUrl ?? null,
        simulationIdForAssets: simulationIdForAssets ?? null,
      }),
      executionOptions: await applyDefaultExecutionOptionsFromProject({
        apiToken,
        executionOptions,
      }),
      screenshottingOptions,
      apiToken,
      commitSha,
      cookiesFile,
      sessionId,
      generatedBy: generatedByOption,
      testRunId: null,
      suppressScreenshotDiffLogging: false,
      ...(enableStepThroughDebugger
        ? {
            onBeforeUserEvent: async (options) =>
              (
                await getOnBeforeUserEventCallback.promise
              )(options),
            onClosePage: async () => (await getOnClosePageCallback.promise)(),
          }
        : {}),
      maxSemanticVersionSupported: 1,
    });

    if (enableStepThroughDebugger) {
      const stepThroughDebuggerUI = await openStepThroughDebuggerUI({
        onLogEventTarget: replayExecution.logEventTarget,
        onCloseReplayedPage: replayExecution.closePage,
        replayableEvents: replayExecution.eventsBeingReplayed,
      });
      getOnBeforeUserEventCallback.resolve(
        stepThroughDebuggerUI.onBeforeUserEvent
      );
      getOnClosePageCallback.resolve(stepThroughDebuggerUI.close);
    }

    await replayExecution.finalResult;
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
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
      description: "Base simulation id to diff the screenshots against",
      alias: "baseSimulationId",
    },
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  })
  .handler(async (options) => {
    await replayCommandHandler(options);
  });
