import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  Replay,
  ReplayEventsFn,
} from "@alwaysmeticulous/common";
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
import { sanitizeFilename } from "../../local-data/local-data.utils";
import { fetchAsset } from "../../local-data/replay-assets";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  readLocalReplayScreenshot,
  readReplayScreenshot,
} from "../../local-data/replays";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { wrapHandler } from "../../utils/sentry.utils";
import { getMeticulousVersion } from "../../utils/version.utils";
import { diffScreenshots } from "../screenshot-diff/screenshot-diff.command";
import { addTestCase } from "../../utils/config.utils";
import { serveAssetsFromSimulation } from "../../local-data/serve-assets-from-simulation";

export interface ReplayCommandHandlerOptions {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  sessionId: string;
  appUrl?: string | null | undefined;
  simulationIdForAssets?: string | null | undefined;
  headless?: boolean | null | undefined;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  screenshot: boolean;
  screenshotSelector?: string | null | undefined;
  baseSimulationId?: string | null | undefined;
  diffThreshold?: number | null | undefined;
  diffPixelThreshold?: number | null | undefined;
  save?: boolean | null | undefined;
  exitOnMismatch?: boolean | null | undefined;
  padTime: boolean;
  shiftTime: boolean;
  networkStubbing: boolean;
  moveBeforeClick?: boolean | null | undefined;
  cookies?: Record<string, any>[];
  cookiesFile?: string | null | undefined;
  accelerate: boolean;
}

export const replayCommandHandler: (
  options: ReplayCommandHandlerOptions
) => Promise<Replay> = async ({
  apiToken,
  commitSha: commitSha_,
  sessionId,
  appUrl,
  simulationIdForAssets,
  headless,
  devTools,
  bypassCSP,
  screenshot,
  screenshotSelector,
  baseSimulationId: baseReplayId_,
  diffThreshold,
  diffPixelThreshold,
  save,
  exitOnMismatch,
  padTime,
  shiftTime,
  networkStubbing,
  moveBeforeClick,
  cookies,
  cookiesFile,
  accelerate,
}) => {
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
  const server = simulationIdForAssets
    ? await serveAssetsFromSimulation(client, simulationIdForAssets)
    : undefined;

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
  const replayEventsParams: Parameters<typeof replayEvents>[0] = {
    appUrl: server ? server.url : appUrl || "",
    browser: null,
    outputDir: tempDir,
    session,
    sessionData,
    recordingId: "manual-replay",
    meticulousSha: "meticulousSha",
    headless: headless || false,
    devTools: devTools || false,
    bypassCSP: bypassCSP || false,
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
    padTime,
    shiftTime,
    screenshot: screenshot,
    screenshotSelector: screenshotSelector || "",
    networkStubbing,
    moveBeforeClick: moveBeforeClick || false,
    cookies: cookies || null,
    cookiesFile: cookiesFile || "",
    accelerate,
  };
  await writeFile(
    join(tempDir, "replayEventsParams.json"),
    JSON.stringify(replayEventsParams)
  );

  // 7. Perform replay
  const startTime = DateTime.utc();

  await replayEvents(replayEventsParams);

  server?.closeServer();

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
      threshold: diffThreshold,
      pixelThreshold: diffPixelThreshold,
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

const handler: (options: ReplayCommandHandlerOptions) => Promise<void> = async (
  options
) => {
  await replayCommandHandler({ ...options, exitOnMismatch: true });
};

export const replay: CommandModule<unknown, ReplayCommandHandlerOptions> = {
  command: "simulate",
  aliases: ["replay"],
  describe: "Simulate (replay) a recorded session",
  builder: {
    apiToken: {
      string: true,
    },
    commitSha: {
      string: true,
    },
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
    diffThreshold: {
      number: true,
      description:
        "Acceptable maximum proportion of changed pixels, between 0 and 1. If this proportion is exceeded then the test will fail.",
    },
    diffPixelThreshold: {
      number: true,
      description:
        "A number between 0 and 1. Color/brightness differences in individual pixels will be ignored if the difference is less than this threshold. A value of 1.0 would accept any difference in color, while a value of 0.0 would accept no difference in color.",
    },
    save: {
      boolean: true,
      description:
        "Adds the simulation to the list of test cases in meticulous.json",
    },
    padTime: {
      boolean: true,
      description:
        "Pad simulation time according to recording duration. Please note this option will be ignored if running with the '--accelerate' option.",
      default: true,
    },
    shiftTime: {
      boolean: true,
      description:
        "Shift time during simulation to be set as the recording time",
      default: true,
    },
    networkStubbing: {
      boolean: true,
      description: "Stub network requests during simulation",
      default: true,
    },
    moveBeforeClick: {
      boolean: true,
      description: "Simulate mouse movement before clicking",
    },
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before simulation",
    },
    accelerate: {
      boolean: true,
      description:
        "Fast forward through any pauses to replay as fast as possible. Warning: this option is experimental and may be deprecated",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
