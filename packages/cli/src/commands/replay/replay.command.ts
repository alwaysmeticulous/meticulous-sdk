import {
  ScreenshotDiffOptions,
  StoryboardOptions,
} from "@alwaysmeticulous/api";
import { defer } from "@alwaysmeticulous/common";
import { replayAndStoreResults } from "@alwaysmeticulous/replay-orchestrator-launcher";
import {
  BeforeUserEventOptions,
  BeforeUserEventResult,
  GeneratedBy,
  NetworkDebuggingOptions,
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
  takeSnapshots: boolean;
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
  sessionIdForApplicationStorage: string | null | undefined;
  networkDebuggingRequestRegexes: string[] | undefined;
  networkDebuggingTransformationFns: string[] | undefined;
  networkDebuggingRequestTypes: string[] | undefined;
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
  takeSnapshots,
  baseReplayId,
  diffThreshold,
  diffPixelThreshold,
  shiftTime,
  networkStubbing,
  moveBeforeMouseEvent,
  cookiesFile,
  disableRemoteFonts,
  noSandbox,
  skipPauses,
  maxDurationMs,
  maxEventCount,
  storyboard,
  essentialFeaturesOnly,
  logPossibleNonDeterminism,
  sessionIdForApplicationStorage,
  debugger: enableStepThroughDebugger,
  networkDebuggingRequestRegexes,
  networkDebuggingTransformationFns,
  networkDebuggingRequestTypes,
}: ReplayCommandHandlerOptions): Promise<void> => {
  if (!takeSnapshots && storyboard) {
    throw new Error(
      "Cannot take storyboard visual snapshots without taking end state snapshots. Please set '--takeSnapshots' to true, or '--storyboard' to false."
    );
  }

  if (headless && enableStepThroughDebugger) {
    throw new Error(
      "Cannot run with both --debugger flag and --headless flag at the same time."
    );
  }

  let networkDebuggingOptions: NetworkDebuggingOptions | undefined = undefined;

  if (
    networkDebuggingRequestRegexes ||
    networkDebuggingTransformationFns ||
    networkDebuggingRequestTypes
  ) {
    networkDebuggingOptions = {
      requestRegexes: networkDebuggingRequestRegexes ?? [],
      transformationsFns: networkDebuggingTransformationFns ?? [],
      requestTypes: (networkDebuggingRequestTypes as Array<
        "original-recorded-request" | "request-to-match"
      >) ?? ["original-recorded-request", "request-to-match"],
    };
  }

  const executionOptions: ReplayExecutionOptions = {
    headless,
    devTools,
    bypassCSP,
    shiftTime,
    networkStubbing,
    skipPauses,
    moveBeforeMouseEvent,
    disableRemoteFonts,
    noSandbox,
    maxDurationMs: maxDurationMs ?? null,
    maxEventCount: maxEventCount ?? null,
    essentialFeaturesOnly,
    logPossibleNonDeterminism,
    ...(networkDebuggingOptions ? { networkDebuggingOptions } : {}),
  };
  const generatedByOption: GeneratedBy = { type: "replayCommand" };
  const storyboardOptions: StoryboardOptions = storyboard
    ? { enabled: true }
    : { enabled: false };
  const screenshottingOptions: ScreenshotComparisonOptions = takeSnapshots
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
      executionOptions,
      screenshottingOptions,
      apiToken,
      commitSha,
      gitRef: null,
      cookiesFile,
      sessionId,
      generatedBy: generatedByOption,
      testRunId: null,
      suppressScreenshotDiffLogging: false,
      disableAssetCache: false,
      sessionIdForApplicationStorage: sessionIdForApplicationStorage ?? null,
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
    takeSnapshots: {
      boolean: true,
      description: "Take a visual snapshot at the end of simulation",
      alias: "screenshot",
      default: true,
    },
    debugger: {
      boolean: true,
      description:
        "Opens a step through debugger to advance through the replay event by event",
      default: false,
    },
    moveBeforeMouseEvent: OPTIONS.moveBeforeMouseEvent,
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before simulation",
    },
    baseReplayId: {
      string: true,
      description: "Base simulation id to diff the visual snapshots against",
      alias: "baseSimulationId",
    },
    networkDebuggingRequestRegexes: {
      type: "array",
      string: true,
      description: "Regexes to match requests against",
    },
    networkDebuggingTransformationFns: {
      type: "array",
      string: true,
      description:
        "Request transformations to log. Will log all if not specified.",
    },
    networkDebuggingRequestTypes: {
      type: "array",
      string: true,
      description: "Types of requests to capture",
      choices: ["original-recorded-request", "request-to-match"],
    },
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  })
  .handler(async (options) => {
    await replayCommandHandler(options);
  });
