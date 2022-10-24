import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  Replay,
  ReplayEventsFn,
} from "@alwaysmeticulous/common";
import {
  ReplayExecutionOptions,
  ReplayTarget,
} from "@alwaysmeticulous/common/dist/types/replay.types";
import { AxiosInstance } from "axios";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import log from "loglevel";
import { DateTime } from "luxon";
import { join } from "path";
import { CommandModule } from "yargs";
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
import {
  COMMON_REPLAY_OPTIONS,
  OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
} from "../../command-utils/common-options";
import {
  CommonReplayOptions,
  getReplayTarget,
  ScreenshotDiffOptions,
  TestExpectationOptions,
} from "../../command-utils/common-types";
import { sanitizeFilename } from "../../local-data/local-data.utils";
import { fetchAsset } from "../../local-data/replay-assets";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  readLocalReplayScreenshot,
  readReplayScreenshot,
} from "../../local-data/replays";
import { serveAssetsFromSimulation } from "../../local-data/serve-assets-from-simulation";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { addTestCase } from "../../utils/config.utils";
import { wrapHandler } from "../../utils/sentry.utils";
import { getMeticulousVersion } from "../../utils/version.utils";
import { diffScreenshots } from "../screenshot-diff/screenshot-diff.command";

export interface ReplayOptions
  extends CommonReplayOptions,
    AdditionalReplayOptions {
  replayTarget: ReplayTarget;
  executionOptions: ReplayExecutionOptions;
  expectationOptions: TestExpectationOptions;
  exitOnMismatch: boolean;
}

export const replayCommandHandler = async ({
  replayTarget,
  executionOptions,
  expectationOptions,
  apiToken,
  sessionId,
  commitSha: commitSha_,
  save,
  exitOnMismatch,
  baseSimulationId: baseReplayId_,
  screenshot,
  cookies,
  cookiesFile,
}: ReplayOptions): Promise<Replay> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  // 1. Check session files
  const session = await getOrFetchRecordedSession(client, sessionId);
  const sessionData = await getOrFetchRecordedSessionData(client, sessionId);

  // 2. Guess commit SHA1
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  logger.debug(`Commit: ${commitSha}`);

  const meticulousSha = await getMeticulousVersion();

  // 3. If simulationIdForAssets specified then download assets & spin up local server
  const { appUrl, closeServer } = await serveOrGetAppUrl(client, replayTarget);

  // 4. Load replay assets
  const browserUserInteractions = await fetchAsset(
    "replay/v2/snippet-user-interactions.bundle.js"
  );
  const browserPlayback = await fetchAsset(
    "replay/v2/snippet-playback.bundle.js"
  );
  const browserUrlObserver = await fetchAsset(
    "replay/v2/snippet-url-observer.bundle.js"
  );
  const nodeBrowserContext = await fetchAsset(
    "replay/v2/node-browser-context.bundle.js"
  );
  const nodeNetworkStubbing = await fetchAsset(
    "replay/v2/node-network-stubbing.bundle.js"
  );
  const nodeUserInteractions = await fetchAsset(
    "replay/v2/node-user-interactions.bundle.js"
  );

  // 5. Load replay package
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
  // TODO: Wire through
  // Note: this is an API break, need to set new min peer dependency on replayer
  const replayEventsParams: Parameters<typeof replayEvents>[0] = {
    appUrl,
    replayExecutionOptions: executionOptions,

    browser: null,
    outputDir: tempDir,
    session,
    sessionData,
    recordingId: "manual-replay",
    meticulousSha: "meticulousSha",

    dependencies: {
      browserUserInteractions: {
        key: "browserUserInteractions",
        location: browserUserInteractions,
      },
      browserPlayback: {
        key: "browserPlayback",
        location: browserPlayback,
      },
      browserUrlObserver: {
        key: "browserUrlObserver",
        location: browserUrlObserver,
      },
      nodeBrowserContext: {
        key: "nodeBrowserContext",
        location: nodeBrowserContext,
      },
      nodeNetworkStubbing: {
        key: "nodeNetworkStubbing",
        location: nodeNetworkStubbing,
      },
      nodeUserInteractions: {
        key: "nodeUserInteractions",
        location: nodeUserInteractions,
      },
    },

    screenshot: screenshot,
    screenshotSelector: expectationOptions.screenshotSelector,
    cookies: cookies,
    cookiesFile: cookiesFile,
  };
  await writeFile(
    join(tempDir, "replayEventsParams.json"),
    JSON.stringify(replayEventsParams)
  );

  // 7. Perform replay
  const startTime = DateTime.utc();

  await replayEvents(replayEventsParams);

  closeServer?.();

  const endTime = DateTime.utc();

  logger.info(
    `Simulation time: ${endTime.diff(startTime).as("seconds")} seconds`
  );
  logger.info("Sending simulation results to Meticulous");

  // 8. Create a Zip archive containing the replay files
  const archivePath = await createReplayArchive(tempDir);

  // 9. Get upload URL
  const replay = await createReplay({
    client,
    commitSha,
    sessionId,
    meticulousSha,
    version: "v2",
    metadata: {},
  });
  const uploadUrlData = await getReplayPushUrl(client, replay.id);
  if (!uploadUrlData) {
    logger.error("Error: Could not get a push URL from the Meticulous API");
    process.exit(1);
  }
  const uploadUrl = uploadUrlData.pushUrl;

  // 10. Send archive to S3
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
  const baseReplayId = baseReplayId_ || "";
  if (screenshot && baseReplayId) {
    logger.info(
      `Diffing final state screenshot against replay ${baseReplayId}`
    );

    await getOrFetchReplay(client, baseReplayId);
    await getOrFetchReplayArchive(client, baseReplayId);

    const baseScreenshot = await readReplayScreenshot(baseReplayId);
    const headScreenshot = await readLocalReplayScreenshot(tempDir);

    await diffScreenshots({
      client,
      baseReplayId,
      headReplayId: replay.id,
      baseScreenshot,
      headScreenshot,
      diffOptions: expectationOptions.screenshotDiffs,
      exitOnMismatch: !!exitOnMismatch,
    });
  }

  // 13. Add test case to meticulous.json if --save option is passed
  if (save) {
    if (!screenshot) {
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

  await deleteArchive(archivePath);

  return replay;
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
  return assertNever(replayTarget);
};

const assertNever = (value: never): any => {
  throw new Error(
    `Unhandled discriminated union member: ${JSON.stringify(value)}`
  );
};

export interface RawReplayCommandHandlerOptions
  extends CommonReplayOptions,
    ScreenshotDiffOptions,
    ReplayExecutionOptions,
    AdditionalReplayOptions {
  appUrl: string | undefined;
  simulationIdForAssets?: string;
  screenshotSelector: string | undefined;
}

interface AdditionalReplayOptions {
  sessionId: string;

  save: boolean | undefined;

  baseSimulationId: string | undefined;

  screenshot: boolean;

  cookies: Record<string, any>[] | undefined;
  cookiesFile: string | undefined;
}

export const rawReplayCommandHandler = ({
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
  cookies,
  cookiesFile,
  accelerate,
}: RawReplayCommandHandlerOptions): Promise<Replay> => {
  const executionOptions: ReplayExecutionOptions = {
    headless,
    devTools,
    bypassCSP,
    padTime,
    shiftTime,
    networkStubbing,
    accelerate,
    moveBeforeClick,
  };
  const expectationOptions: TestExpectationOptions = {
    screenshotDiffs: { diffPixelThreshold, diffThreshold },
    screenshotSelector: screenshotSelector ?? undefined,
  };
  return replayCommandHandler({
    replayTarget: getReplayTarget({ appUrl, simulationIdForAssets }),
    executionOptions,
    expectationOptions,
    apiToken,
    commitSha,
    cookies,
    cookiesFile,
    sessionId,
    screenshot,
    baseSimulationId,
    save,
    exitOnMismatch: true,
  });
};

export const replay: CommandModule<unknown, RawReplayCommandHandlerOptions> = {
  command: "simulate",
  aliases: ["replay"],
  describe: "Simulate (replay) a recorded session",
  builder: {
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
    moveBeforeClick: {
      boolean: true,
      description: "Simulate mouse movement before clicking",
      default: false,
    },
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before simulation",
    },
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  },
  handler: wrapHandler(async (options) => {
    await rawReplayCommandHandler(options);
  }),
};
