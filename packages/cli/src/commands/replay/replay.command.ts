import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { ScreenshotDiffResult } from "@alwaysmeticulous/api";
import {
  GeneratedBy,
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  Replay,
  ReplayEventsDependencies,
  ReplayEventsFn,
  ReplayEventsOptions,
  ReplayExecutionOptions,
  ReplayTarget,
  StoryboardOptions,
} from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { DateTime } from "luxon";
import { createClient } from "../../api/client";
import {
  createReplay,
  getReplayCommandId,
  getReplayPushUrl,
  getReplayUrl,
  putReplayPushedStatus,
} from "../../api/replay.api";
import { uploadArchive } from "../../api/upload";
import { createReplayArchive, deleteArchive } from "../../archive/archive";
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
import { sanitizeFilename } from "../../local-data/local-data.utils";
import { loadReplayEventsDependencies } from "../../local-data/replay-assets";
import { serveAssetsFromSimulation } from "../../local-data/serve-assets-from-simulation";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { addTestCase } from "../../utils/config.utils";
import { getMeticulousVersion } from "../../utils/version.utils";
import { ScreenshotDiffsSummary } from "../screenshot-diff/screenshot-diff.command";
import { computeAndSaveDiff } from "./utils/compute-and-save-diff";

export interface ReplayOptions extends AdditionalReplayOptions {
  replayTarget: ReplayTarget;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsOptions;
  generatedBy: GeneratedBy;
  testRunId: string | null;
  replayEventsDependencies: ReplayEventsDependencies;
}

export interface ReplayResult {
  replay: Replay;
  screenshotDiffResults: ScreenshotDiffResult[] | null;
  screenshotDiffsSummary: ScreenshotDiffsSummary;
}

export const replayCommandHandler = async ({
  replayTarget,
  executionOptions,
  screenshottingOptions,
  apiToken,
  sessionId,
  commitSha: commitSha_,
  save,
  baseSimulationId: baseReplayId_,
  cookiesFile,
  generatedBy,
  testRunId,
  replayEventsDependencies,
}: ReplayOptions): Promise<ReplayResult> => {
  const transaction = Sentry.startTransaction({
    name: "replay.command_handler",
    description: "Handle the replay command",
    op: "replay.command_handler",
  });
  Sentry.getCurrentHub().configureScope((scope) => scope.setSpan(transaction));
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  // 1. Check session files
  const fetchSessions = transaction.startChild({ op: "fetchingSessions" });
  const session = await getOrFetchRecordedSession(client, sessionId);
  const sessionData = await getOrFetchRecordedSessionData(client, sessionId);
  fetchSessions.finish();

  // 2. Guess commit SHA1
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  logger.debug(`Commit: ${commitSha}`);

  const meticulousSha = await getMeticulousVersion();

  // 3. If simulationIdForAssets specified then download assets & spin up local server
  const serveOrGetAppUrlSpan = transaction.startChild({
    op: "serveOrGetAppUrl",
  });
  const { appUrl, closeServer } = await serveOrGetAppUrl(client, replayTarget);
  serveOrGetAppUrlSpan.finish();

  // 4. Load replay package
  let replayEvents: ReplayEventsFn;

  try {
    const replayer = await require("@alwaysmeticulous/replayer");
    replayEvents = replayer.replayEvents;
  } catch (error) {
    logger.error("Error: could not import @alwaysmeticulous/replayer");
    logger.error(error);
    process.exit(1);
  }

  // Report replay start
  const replayCommandId = await getReplayCommandId(client, sessionId);

  // 5. Create replay directory
  await mkdir(join(getMeticulousLocalDataDir(), "replays"), {
    recursive: true,
  });
  const tempDirName = sanitizeFilename(`${new Date().toISOString()}-`);
  const tempDir = await mkdtemp(
    join(getMeticulousLocalDataDir(), "replays", tempDirName)
  );

  // 6. Create and save replay parameters
  const replayEventsParams: ReplayEventsOptions = {
    appUrl: appUrl ?? null,
    replayExecutionOptions: executionOptions,

    browser: null,
    outputDir: tempDir,
    session,
    sessionData,
    recordingId: "manual-replay",
    meticulousSha: "meticulousSha",
    generatedBy,
    testRunId,

    dependencies: replayEventsDependencies,
    screenshottingOptions,
    cookiesFile: cookiesFile ?? null,
  };
  await writeFile(
    join(tempDir, "replayEventsParams.json"),
    JSON.stringify(replayEventsParams)
  );

  // 7. Perform replay
  const startTime = DateTime.utc();

  await replayEvents({
    ...replayEventsParams,
    parentPerformanceSpan: transaction.startChild({ op: "replayEvents" }),
  });

  closeServer?.();

  const endTime = DateTime.utc();

  logger.info(
    `Simulation time: ${endTime.diff(startTime).as("seconds")} seconds`
  );
  logger.info("Sending simulation results to Meticulous");

  // 8. Create a Zip archive containing the replay files
  const createReplayArchiveSpan = transaction.startChild({
    op: "createArchiveAndUpload",
  });
  const archivePath = await createReplayArchive(tempDir);
  createReplayArchiveSpan.finish();

  try {
    // 9. Get upload URL
    const getReplayPushUrlSpan = transaction.startChild({
      op: "getReplayPushUrl",
    });
    const replay = await createReplay({
      client,
      commitSha,
      sessionId,
      meticulousSha,
      version: "v2",
      metadata: { generatedBy },
    });
    const uploadUrlData = await getReplayPushUrl(client, replay.id);
    if (!uploadUrlData) {
      logger.error("Error: Could not get a push URL from the Meticulous API");
      process.exit(1);
    }
    const uploadUrl = uploadUrlData.pushUrl;
    getReplayPushUrlSpan.finish();

    // 10. Send archive to S3
    const uploadArchiveSpan = transaction.startChild({ op: "uploadArchive" });
    try {
      await uploadArchive(uploadUrl, archivePath);
    } catch (error) {
      await putReplayPushedStatus(
        client,
        replay.id,
        "failure",
        replayCommandId
      ).catch(logger.error);
      logger.error(error);
      process.exit(1);
    }
    uploadArchiveSpan.finish();

    // 11. Report successful upload to Meticulous
    const updatedProjectBuild = await putReplayPushedStatus(
      client,
      replay.id,
      "success",
      replayCommandId
    );
    logger.info("Simulation artifacts successfully sent to Meticulous");
    logger.debug(updatedProjectBuild);

    const replayUrl = getReplayUrl(replay);
    logger.info("=======");
    logger.info(`View simulation at: ${replayUrl}`);
    logger.info("=======");

    // 12. Diff against base replay screenshot if one is provided
    const computeAndSaveDiffSpan = transaction.startChild({ op: "computeAndSaveDiff" });
    const { screenshotDiffResults, screenshotDiffsSummary } =
      screenshottingOptions.enabled && baseReplayId_
        ? await computeAndSaveDiff({
            client,
            baseReplayId: baseReplayId_ ?? "",
            headReplayId: replay.id,
            tempDir,
            screenshottingOptions,
            testRunId,
          })
        : {
            screenshotDiffResults: null,
            screenshotDiffsSummary: { hasDiffs: false as const },
          };
    computeAndSaveDiffSpan.finish();

    // 13. Add test case to meticulous.json if --save option is passed
    if (save) {
      if (!screenshottingOptions.enabled) {
        logger.error(
          "Warning: saving a new test case without screenshot enabled."
        );
      }

      await addTestCase({
        title: `${sessionId} | ${replay.id}`,
        sessionId,
        baseReplayId: replay.id,
      });
    }

    return { replay, screenshotDiffResults, screenshotDiffsSummary };
  } finally {
    await deleteArchive(archivePath);
    transaction.finish();
  }
};

const serveOrGetAppUrl = async (
  client: AxiosInstance,
  replayTarget: ReplayTarget
): Promise<{ appUrl?: string; closeServer?: () => void }> => {
  if (replayTarget.type === "snapshotted-assets") {
    const server = await serveAssetsFromSimulation(
      client,
      replayTarget.simulationIdForAssets
    );
    return {
      appUrl: server.url,
      closeServer: server.closeServer,
    };
  }
  if (replayTarget.type === "url") {
    return { appUrl: replayTarget.appUrl };
  }
  if (replayTarget.type === "original-recorded-url") {
    return {};
  }
  return unknownReplayTargetType(replayTarget);
};

const unknownReplayTargetType = (replayTarget: never): never => {
  throw new Error(
    `Unknown type of replay target: ${JSON.stringify(replayTarget)}`
  );
};

export interface RawReplayCommandHandlerOptions
  extends ScreenshotDiffOptions,
    Omit<ReplayExecutionOptions, "maxDurationMs" | "maxEventCount">,
    AdditionalReplayOptions {
  screenshot: boolean;
  appUrl: string | null | undefined;
  simulationIdForAssets: string | null | undefined;
  screenshotSelector: string | null | undefined;
  maxDurationMs: number | null | undefined;
  maxEventCount: number | null | undefined;
  storyboard: boolean;
}

interface AdditionalReplayOptions {
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  sessionId: string;
  save: boolean | null | undefined;
  baseSimulationId: string | null | undefined;
  cookiesFile: string | null | undefined;
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
  screenshotSelector,
  baseSimulationId,
  diffThreshold,
  diffPixelThreshold,
  save,
  padTime,
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
}: RawReplayCommandHandlerOptions): Promise<Replay> => {
  const executionOptions: ReplayExecutionOptions = {
    headless,
    devTools,
    bypassCSP,
    padTime,
    shiftTime,
    networkStubbing,
    skipPauses,
    moveBeforeClick,
    disableRemoteFonts,
    noSandbox,
    maxDurationMs: maxDurationMs ?? null,
    maxEventCount: maxEventCount ?? null,
  };
  const generatedByOption: GeneratedBy = { type: "replayCommand" };
  const storyboardOptions: StoryboardOptions = storyboard
    ? { enabled: true }
    : { enabled: false };
  const screenshottingOptions: ScreenshotAssertionsOptions = screenshot
    ? {
        enabled: true,
        screenshotSelector: screenshotSelector ?? null,
        diffOptions: { diffPixelThreshold, diffThreshold },
        storyboardOptions,
      }
    : { enabled: false };
  const replayEventsDependencies = await loadReplayEventsDependencies();
  const { replay, screenshotDiffsSummary } = await replayCommandHandler({
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
    baseSimulationId,
    save,
    generatedBy: generatedByOption,
    testRunId: null,
    replayEventsDependencies,
  });

  if (screenshotDiffsSummary.hasDiffs) {
    process.exit(1);
  }

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
    screenshotSelector: {
      string: true,
      description:
        "Query selector to screenshot a specific DOM element instead of the whole page",
    },
    baseSimulationId: {
      string: true,
      description:
        "Base simulation id to diff the final state screenshot against",
      alias: "baseReplayId",
    },
    save: {
      boolean: true,
      description:
        "Adds the simulation to the list of test cases in meticulous.json",
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
