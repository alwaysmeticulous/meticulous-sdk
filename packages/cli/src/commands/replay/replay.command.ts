import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
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
import { readConfig, saveConfig } from "../../config/config";
import { MeticulousCliConfig } from "../../config/config.types";
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

interface Options {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  sessionId: string;
  appUrl?: string | null | undefined;
  headless?: boolean | null | undefined;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  screenshot?: boolean | null | undefined;
  screenshotSelector?: string | null | undefined;
  baseReplayId?: string | null | undefined;
  diffThreshold?: number | null | undefined;
  diffPixelThreshold?: number | null | undefined;
  save?: boolean | null | undefined;
  exitOnMismatch?: boolean | null | undefined;
  padTime: boolean;
  networkStubbing: boolean;
  moveBeforeClick?: boolean | null | undefined;
  cookies?: Record<string, any>[];
  cookiesFile?: string | null | undefined;
}

export const replayCommandHandler: (options: Options) => Promise<any> = async ({
  apiToken,
  commitSha: commitSha_,
  sessionId,
  appUrl,
  headless,
  devTools,
  bypassCSP,
  screenshot,
  screenshotSelector,
  baseReplayId: baseReplayId_,
  diffThreshold,
  diffPixelThreshold,
  save,
  exitOnMismatch,
  padTime,
  networkStubbing,
  moveBeforeClick,
  cookies,
  cookiesFile,
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

  // 3. Load replay assets
  const reanimator = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/reanimator.bundle.js"
  );
  const replayNetworkFile = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/replay-network-events.bundle.js"
  );
  const jsReplay = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/replay-only-replayjs-forked.js"
  );
  const rrweb = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/rrweb.js"
  );

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
  const replayEventsParams: Parameters<typeof replayEvents>[0] = {
    appUrl: appUrl || "",
    browser: null,
    tempDir,
    session,
    sessionData,
    recordingId: "manual-replay",
    meticulousSha: "meticulousSha",
    headless: headless || false,
    devTools: devTools || false,
    bypassCSP: bypassCSP || false,
    dependencies: {
      reanimator: {
        key: "reanimator",
        location: reanimator,
      },
      replayNetworkFile: {
        key: "replayNetworkFile",
        location: replayNetworkFile,
      },
      jsReplay: {
        key: "jsReplay",
        location: jsReplay,
      },
      rrweb: {
        key: "rrweb",
        location: rrweb,
      },
    },
    padTime,
    screenshot: screenshot || false,
    screenshotSelector: screenshotSelector || "",
    networkStubbing,
    moveBeforeClick: moveBeforeClick || false,
    cookies: cookies || null,
    cookiesFile: cookiesFile || "",
  };
  await writeFile(
    join(tempDir, "replayEventsParams.json"),
    JSON.stringify(replayEventsParams)
  );

  // 7. Perform replay
  logger.info("Starting replay...");
  const startTime = DateTime.utc();

  const { eventsFinishedPromise, writesFinishedPromise } = await replayEvents(
    replayEventsParams
  );

  await eventsFinishedPromise;
  await writesFinishedPromise;

  const endTime = DateTime.utc();

  logger.info(`Replay time: ${endTime.diff(startTime).as("seconds")} seconds`);
  logger.info("Sending replay results to Meticulous");

  // 8. Create a Zip archive containing the replay files
  const archivePath = await createReplayArchive(tempDir);

  // 9. Get upload URL
  const replay = await createReplay({
    client,
    commitSha,
    sessionId,
    meticulousSha,
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
  logger.info("Replay artifacts successfully sent to Meticulous");
  logger.debug(updatedProjectBuild);

  const replayUrl = getReplayUrl(replay);
  logger.info("=======");
  logger.info(`View replay at: ${replayUrl}`);
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

    const meticulousConfig = await readConfig();
    const newConfig: MeticulousCliConfig = {
      ...meticulousConfig,
      testCases: [
        ...(meticulousConfig.testCases || []),
        {
          title: `${sessionId} | ${replay.id}`,
          sessionId,
          baseReplayId: replay.id,
        },
      ],
    };
    await saveConfig(newConfig);
  }

  await deleteArchive(archivePath);

  return replay;
};

const handler: (options: Options) => Promise<void> = async (options) => {
  await replayCommandHandler({ ...options, exitOnMismatch: true });
};

export const replay: CommandModule<unknown, Options> = {
  command: "replay",
  describe: "Replay a recorded session",
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
      description: "Take a screenshot at the end of replay",
    },
    screenshotSelector: {
      string: true,
      description:
        "Query selector to screenshot a specific DOM element instead of the whole page",
    },
    baseReplayId: {
      string: true,
      description: "Base replay id to diff the final state screenshot against",
    },
    diffThreshold: {
      number: true,
    },
    diffPixelThreshold: {
      number: true,
    },
    save: {
      boolean: true,
      description:
        "Adds the replay to the list of test cases in meticulous.json",
    },
    padTime: {
      boolean: true,
      description: "Pad replay time according to recording duration",
      default: true,
    },
    networkStubbing: {
      boolean: true,
      description: "Stub network requests during replay",
      default: true,
    },
    moveBeforeClick: {
      boolean: true,
      description: "Simulate mouse movement before clicking",
    },
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before replay",
    },
  },
  handler: wrapHandler(handler),
};
