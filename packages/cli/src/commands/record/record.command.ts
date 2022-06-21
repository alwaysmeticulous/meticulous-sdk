import type { RecordSessionFn } from "@alwaysmeticulous/common";
import {
  DebugLogger,
  getMeticulousLocalDataDir,
} from "@alwaysmeticulous/common";
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
  width,
  height,
  uploadIntervalMs,
  incognito,
  trace,
}) => {
  const logger = trace ? await DebugLogger.create() : null;
  logger?.log("Record options:");
  logger?.logObject({
    apiToken,
    commitSha: commitSha_,
    devTools,
    width,
    height,
    uploadIntervalMs,
    incognito,
    trace,
  });

  // 1. Fetch the recording token
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    console.error("Could not retrieve project data. Is the API token correct?");
    logger?.log("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const recordingToken = project.recordingToken;
  if (!recordingToken) {
    console.error("Could not retrieve recording token.");
    logger?.log("Could not retrieve recording token.");
    process.exit(1);
  }
  console.log(`Recording token: ${recordingToken}`);

  // 2. Guess commit SHA1
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  console.log(`Commit: ${commitSha}`);

  // 3. Load recording snippets
  const recordingSnippet = await fetchAsset(
    "https://snippet.meticulous.ai/v1/stagingMeticulousSnippet.js"
  );
  const fetchStallSnippet = await fetchAsset(
    "https://snippet.meticulous.ai/record/v1/fetch-stall.bundle.js"
  );

  // 4. Load recording package
  let recordSession: RecordSessionFn;

  try {
    const record = await require("@alwaysmeticulous/record");
    recordSession = record.recordSession;
  } catch (error) {
    console.error("Error: could not import @alwaysmeticulous/record");
    console.error(error);
    logger?.log("Error: could not import @alwaysmeticulous/record");
    logger?.log(`${error}`);
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
    recordingSnippet,
    fetchStallSnippet,
    width,
    height,
    uploadIntervalMs,
    incognito,
    cookieDir,
    logger,
    onDetectedSession: (sessionId) => {
      postSessionIdNotification(client, sessionId, recordingCommandId).catch(
        (error) => {
          console.error(
            `Warning: error while notifying session recording ${sessionId}`
          );
          console.error(error);
          logger?.log(
            `Warning: error while notifying session recording ${sessionId}`
          );
          logger?.log(`${error}`);
        }
      );
    },
  }).catch((error) => {
    logger?.log(`${error}`);
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
