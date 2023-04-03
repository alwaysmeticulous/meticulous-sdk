import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { join, normalize } from "path";
import { createClient } from "@alwaysmeticulous/client";
import {
  getCommitSha,
  getMeticulousLocalDataDir,
  getMeticulousVersion,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
  sanitizeFilename,
} from "@alwaysmeticulous/downloading-helpers";
import {
  launchBrowserAndReplay,
  ReplayEventsDependencies,
  LaunchBrowserAndReplayOptions,
} from "@alwaysmeticulous/replay-launcher";
import {
  ReplayAndStoreResultsOptions,
  ReplayAndStoreResultsResult,
  ReplayExecution,
  ReplayTarget,
} from "@alwaysmeticulous/sdk-bundles-api";
import * as Sentry from "@sentry/node";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { DateTime } from "luxon";
import {
  createReplay,
  CreateReplayOptions,
  getReplayCommandId,
  getReplayPushUrl,
  putReplayPushedStatus,
} from "../api/replay.api";
import { maybeDownloadAndDiffScreenshots } from "./screenshot-diffing/download-and-diff-screenshots";
import { loadReplayEventsDependencies } from "./scripts-loader/load-replay-dependencies";
import { createReplayArchive, deleteArchive } from "./utils/archive";
import { exitEarlyIfSkipUploadEnvVarSet } from "./utils/exit-early-if-skip-upload-env-var-set";
import { getReplayUrl } from "./utils/get-replay-url";
import { serveAssetsFromSimulation } from "./utils/serve-assets-from-simulation";
import { uploadArchive } from "./utils/upload";

/**
 * See {@link ReplayAndStoreResultsOptions.maxSemanticVersionSupported} for more details.
 */
export const CURRENT_REPLAY_AND_STORE_RESULTS_SEMANTIC_VERSION: ReplayAndStoreResultsOptions["maxSemanticVersionSupported"] = 1;

export const replayAndStoreResults = async ({
  replayTarget,
  executionOptions,
  screenshottingOptions,
  apiToken,
  sessionId,
  commitSha: commitSha_,
  cookiesFile,
  generatedBy,
  testRunId,
  replayEventsDependencies,
  suppressScreenshotDiffLogging,
  onBeforeUserEvent,
  onClosePage,
}: ReplayAndStoreResultsOptions & {
  replayEventsDependencies?: ReplayEventsDependencies;
}): Promise<ReplayExecution> => {
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

  const packageJsonPath = normalize(join(__dirname, "../../../package.json"));
  const meticulousSha = await getMeticulousVersion(packageJsonPath);

  // 3. If simulationIdForAssets specified then download assets & spin up local server
  const serveOrGetAppUrlSpan = transaction.startChild({
    op: "serveOrGetAppUrl",
  });
  const { appUrl, closeServer } = await serveOrGetAppUrl(client, replayTarget);
  serveOrGetAppUrlSpan.finish();

  // 4. Maybe download replayEventsDependencies
  if (replayEventsDependencies == null) {
    const downloadReplayEventsDependenciesSpan = transaction.startChild({
      op: "downloadReplayEventsDependencies",
    });
    replayEventsDependencies = await loadReplayEventsDependencies();
    downloadReplayEventsDependenciesSpan.finish();
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
  const replayDir = await mkdtemp(
    join(getMeticulousLocalDataDir(), "replays", tempDirName)
  );

  // 6. Create and save replay parameters
  logger.debug("Snapshotting replay parameters...");
  const launchBrowserAndReplayParams: Omit<
    LaunchBrowserAndReplayOptions,
    "sessionData" | "onBeforeUserEvent" | "onClosePage"
  > = {
    appUrl: appUrl ?? null,
    replayExecutionOptions: executionOptions,

    browser: null,
    outputDir: replayDir,
    session,
    recordingId: "manual-replay",
    meticulousSha: "meticulousSha",
    generatedBy,
    testRunId,

    dependencies: replayEventsDependencies,
    screenshottingOptions,
    cookiesFile: cookiesFile ?? null,
  };
  await writeFile(
    join(replayDir, "launchBrowserAndReplayParams.json"),
    JSON.stringify(launchBrowserAndReplayParams)
  );

  // 7. Perform replay
  logger.debug("Beggining replay...");
  const startTime = DateTime.utc();

  const replayBrowser = await launchBrowserAndReplay({
    ...launchBrowserAndReplayParams,
    ...(onBeforeUserEvent != null ? { onBeforeUserEvent } : {}),
    ...(onClosePage != null ? { onClosePage } : {}),
    sessionData,
    parentPerformanceSpan: transaction.startChild({
      op: "launchBrowserAndReplay",
    }),
  });

  return {
    finalResult: replayBrowser.replayCompletionPromise.then(async () => {
      closeServer?.();

      const endTime = DateTime.utc();

      logger.info(
        `Simulation time: ${endTime.diff(startTime).as("seconds")} seconds`
      );

      return await computeDiffsAndUploadResults({
        screenshottingOptions,
        sessionId,
        suppressScreenshotDiffLogging,
        createReplayOptions: {
          client,
          commitSha,
          sessionId,
          meticulousSha,
          version: "v2",
          metadata: { generatedBy },
        },
        replayCommandId,
        replayDir,
        transaction,
      });
    }),
    eventsBeingReplayed: sessionData.userEvents.event_log,
    closePage: replayBrowser.closePage,
    logEventTarget: replayBrowser.logEventTarget,
  };
};

interface ComputeDiffsAndUploadResultsOptions
  extends Pick<
    ReplayAndStoreResultsOptions,
    "screenshottingOptions" | "sessionId" | "suppressScreenshotDiffLogging"
  > {
  createReplayOptions: CreateReplayOptions;
  replayCommandId: string;
  replayDir: string;
  transaction: Sentry.Span;
}

const computeDiffsAndUploadResults = async ({
  createReplayOptions,
  replayCommandId,
  replayDir,
  screenshottingOptions,
  sessionId,
  suppressScreenshotDiffLogging,
  transaction,
}: ComputeDiffsAndUploadResultsOptions): Promise<ReplayAndStoreResultsResult> => {
  exitEarlyIfSkipUploadEnvVarSet(screenshottingOptions);

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.info("Sending simulation results to Meticulous");

  // 1. Create a Zip archive containing the replay files
  const createReplayArchiveSpan = transaction.startChild({
    op: "createArchiveAndUpload",
  });
  const archivePath = await createReplayArchive(replayDir);
  createReplayArchiveSpan.finish();

  try {
    // 2. Get upload URL
    const getReplayPushUrlSpan = transaction.startChild({
      op: "getReplayPushUrl",
    });
    const replay = await createReplay(createReplayOptions);
    const { client } = createReplayOptions;
    const uploadUrlData = await getReplayPushUrl(client, replay.id);
    if (!uploadUrlData) {
      logger.error("Error: Could not get a push URL from the Meticulous API");
      process.exit(1);
    }
    const uploadUrl = uploadUrlData.pushUrl;
    getReplayPushUrlSpan.finish();

    // 3. Send archive to S3
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

    // 4. Report successful upload to Meticulous
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

    // 5. Diff against base replay screenshot if one is provided
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
      await maybeDownloadAndDiffScreenshots({
        client,
        sessionId,
        headReplayId: replay.id,
        headReplayDir: replayDir,
        screenshottingOptions,
        logger: computeDiffsLogger,
      });
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
