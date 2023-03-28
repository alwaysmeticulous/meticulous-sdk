import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import {
  ScreenshotDiffResult,
  ScreenshotAssertionsOptions,
  ScreenshotDiffOptions,
} from "@alwaysmeticulous/api";
import { createClient } from "@alwaysmeticulous/client";
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
  getMeticulousVersion,
  getCommitSha,
} from "@alwaysmeticulous/common";
import {
  sanitizeFilename,
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "@alwaysmeticulous/download-helpers";
import * as Sentry from "@sentry/node";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { DateTime } from "luxon";
import {
  createReplay,
  getReplayCommandId,
  getReplayPushUrl,
  putReplayPushedStatus,
} from "../api/replay.api";
import { downloadAndDiffScreenshots } from "./screenshot-diffing/download-and-diff-screenshots";
import { createReplayArchive, deleteArchive } from "./utils/archive";
import { exitEarlyIfSkipUploadEnvVarSet } from "./utils/exit-early-if-skip-upload-env-var-set";
import { getReplayUrl } from "./utils/get-replay-url";
import { serveAssetsFromSimulation } from "./utils/serve-assets-from-simulation";
import { uploadArchive } from "./utils/upload";

export interface ReplayOptions extends AdditionalReplayOptions {
  replayTarget: ReplayTarget;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsOptions;
  generatedBy: GeneratedBy;
  testRunId: string | null;
  replayEventsDependencies: ReplayEventsDependencies;
  suppressScreenshotDiffLogging: boolean;
}

interface AdditionalReplayOptions {
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  sessionId: string;
  baseTestRunId: string | null | undefined;
  cookiesFile: string | null | undefined;
  debugger: boolean;
}

export interface ReplayResult {
  replay: Replay;

  /**
   * Empty if screenshottingOptions.enabled was false.
   */
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}

export const performReplay = async ({
  replayTarget,
  executionOptions,
  screenshottingOptions,
  apiToken,
  sessionId,
  commitSha: commitSha_,
  baseTestRunId,
  cookiesFile,
  generatedBy,
  testRunId,
  replayEventsDependencies,
  debugger: enableStepThroughDebugger,
  suppressScreenshotDiffLogging,
}: ReplayOptions): Promise<ReplayResult> => {
  if (
    executionOptions.headless === true &&
    enableStepThroughDebugger === true
  ) {
    throw new Error(
      "Cannot run with both --debugger flag and --headless flag at the same time."
    );
  }

  const rootTransaction = Sentry.getCurrentHub().getScope()?.getTransaction();
  const handlerSpanContext = {
    name: "replay.command_handler",
    description: "Handle the replay command",
    op: "replay.command_handler",
  };
  let transaction: Sentry.Span;
  if (rootTransaction) {
    transaction = rootTransaction.startChild(handlerSpanContext);
  } else {
    transaction = Sentry.startTransaction(handlerSpanContext);
  }

  Sentry.getCurrentHub().configureScope((scope) => scope.setSpan(transaction));
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  // 1. Check session files
  const fetchSessions = transaction.startChild({ op: "fetchingSessions" });
  const { data: session } = await getOrFetchRecordedSession(client, sessionId);
  const { data: sessionData } = await getOrFetchRecordedSessionData(
    client,
    sessionId
  );
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
    logger.debug("Loading replayer package...");
    const replayer = await require("@alwaysmeticulous/replayer");
    replayEvents = replayer.replayEvents;
  } catch (error) {
    logger.error("Error: could not import @alwaysmeticulous/replayer");
    logger.error(error);
    process.exit(1);
  }

  // Report replay start
  logger.debug("Reporting replay started...");
  const replayCommandId = await getReplayCommandId(client, sessionId);

  // 5. Create replay directory
  logger.debug("Creating directory to store replay output...");
  await mkdir(join(getMeticulousLocalDataDir(), "replays"), {
    recursive: true,
  });
  const tempDirName = sanitizeFilename(`${new Date().toISOString()}-`);
  const tempDir = await mkdtemp(
    join(getMeticulousLocalDataDir(), "replays", tempDirName)
  );

  // 6. Create and save replay parameters
  logger.debug("Snapshotting replay parameters...");
  const replayEventsParams: Omit<ReplayEventsOptions, "sessionData"> = {
    appUrl: appUrl ?? null,
    replayExecutionOptions: executionOptions,

    browser: null,
    outputDir: tempDir,
    session,
    recordingId: "manual-replay",
    meticulousSha: "meticulousSha",
    generatedBy,
    testRunId,

    dependencies: replayEventsDependencies,
    enableStepThroughDebugger,
    screenshottingOptions,
    cookiesFile: cookiesFile ?? null,
  };
  await writeFile(
    join(tempDir, "replayEventsParams.json"),
    JSON.stringify(replayEventsParams)
  );

  // 7. Perform replay
  logger.debug("Beggining replay...");
  const startTime = DateTime.utc();

  await replayEvents({
    ...replayEventsParams,
    sessionData,
    parentPerformanceSpan: transaction.startChild({ op: "replayEvents" }),
  });

  closeServer?.();

  const endTime = DateTime.utc();

  logger.info(
    `Simulation time: ${endTime.diff(startTime).as("seconds")} seconds`
  );

  exitEarlyIfSkipUploadEnvVarSet(baseTestRunId);

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
    const computeDiffSpan = transaction.startChild({
      op: "computeDiff",
    });
    const computeDiffsLogger = log.getLogger(
      `METICULOUS_LOGGER_NAME/compute-diffs`
    );
    if (suppressScreenshotDiffLogging) {
      computeDiffsLogger.setLevel("ERROR", false);
    } else {
      computeDiffsLogger.setLevel(logger.getLevel(), false);
    }

    const screenshotDiffResultsByBaseReplayId =
      screenshottingOptions.enabled && baseTestRunId
        ? await downloadAndDiffScreenshots({
            client,
            baseTestRunId,
            sessionId,
            headReplayId: replay.id,
            tempDir,
            screenshottingOptions,
            logger: computeDiffsLogger,
          })
        : {};
    computeDiffSpan.finish();

    return { replay, screenshotDiffResultsByBaseReplayId };
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
