import {
  DebugLogger,
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  RecordSessionFn,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { join } from "path";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { getProject } from "../../api/project.api";
import {
  getRecordingCommandId,
  postSessionIdNotification,
} from "../../api/session.api";
import { fetchAsset } from "../../local-data/replay-assets";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { wrapHandler } from "../../utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  width?: number | null | undefined;
  height?: number | null | undefined;
  uploadIntervalMs?: number | null | undefined;
  incognito?: boolean | null | undefined;
  trace?: boolean | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  devTools,
  bypassCSP,
  width,
  height,
  uploadIntervalMs,
  incognito,
  trace,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const debugLogger = trace ? await DebugLogger.create() : null;
  debugLogger?.log("Record options:");
  debugLogger?.logObject({
    apiToken,
    commitSha: commitSha_,
    devTools,
    width,
    height,
    uploadIntervalMs,
    incognito,
    trace,
  });

  logger.info("Preparing recording...");

  // 1. Fetch the recording token
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    debugLogger?.log(
      "Could not retrieve project data. Is the API token correct?"
    );
    process.exit(1);
  }

  const recordingToken = project.recordingToken;
  if (!recordingToken) {
    logger.error("Could not retrieve recording token.");
    debugLogger?.log("Could not retrieve recording token.");
    process.exit(1);
  }
  logger.debug(`Recording token: ${recordingToken}`);

  // 2. Guess commit SHA1
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  logger.debug(`Commit: ${commitSha}`);

  // 3. Load recording snippets
  const recordingSnippet = await fetchAsset(
    "https://snippet.meticulous.ai/v1/stagingMeticulousSnippet.js"
  );
  const earlyNetworkRecorderSnippet = await fetchAsset(
    "https://snippet.meticulous.ai/record/v1/network-recorder.bundle.js"
  );

  // 4. Load recording package
  let recordSession: RecordSessionFn;

  try {
    const record = await require("@alwaysmeticulous/record");
    recordSession = record.recordSession;
  } catch (error) {
    logger.error("Error: could not import @alwaysmeticulous/record");
    logger.error(error);
    debugLogger?.log("Error: could not import @alwaysmeticulous/record");
    debugLogger?.log(`${error}`);
    process.exit(1);
  }

  const cookieDir = join(getMeticulousLocalDataDir(), "cookies");

  // Report recording start
  const recordingCommandId = await getRecordingCommandId(client);

  // 5. Start recording
  await recordSession({
    browser: null,
    project,
    recordingToken,
    appCommitHash: commitSha,
    devTools,
    bypassCSP,
    recordingSnippet,
    earlyNetworkRecorderSnippet,
    width,
    height,
    uploadIntervalMs,
    incognito,
    cookieDir,
    debugLogger,
    onDetectedSession: (sessionId) => {
      postSessionIdNotification(client, sessionId, recordingCommandId).catch(
        (error) => {
          logger.error(
            `Warning: error while notifying session recording ${sessionId}`
          );
          logger.error(error);
          debugLogger?.log(
            `Warning: error while notifying session recording ${sessionId}`
          );
          debugLogger?.log(`${error}`);
        }
      );
    },
  }).catch((error) => {
    debugLogger?.log(`${error}`);
    throw error;
  });
};

export const record: CommandModule<unknown, Options> = {
  command: "record",
  describe: "Record a session",
  builder: {
    apiToken: {
      string: true,
      demandOption: true,
    },
    commitSha: {
      string: true,
    },
    devTools: {
      boolean: true,
      description: "Open Chrome Dev Tools",
    },
    bypassCSP: {
      boolean: true,
      description: "Enables bypass CSP in the browser",
    },
    width: {
      number: true,
    },
    height: {
      number: true,
    },
    uploadIntervalMs: {
      number: true,
      description: "Meticulous recording upload interval (in milliseconds)",
    },
    incognito: {
      boolean: true,
      description: "Use an incognito browsing context",
      default: true,
    },
    trace: {
      boolean: true,
      description: "Enable verbose logging",
    },
  },
  handler: wrapHandler(handler),
};
