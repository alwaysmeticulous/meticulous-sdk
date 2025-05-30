import { join } from "path";
import {
  createClient,
  getProject,
  getRecordingCommandId,
  postSessionIdNotification,
} from "@alwaysmeticulous/client";
import {
  DebugLogger,
  getCommitSha,
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import { recordSession } from "@alwaysmeticulous/record";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_RECORD_OPTIONS,
  OPTIONS,
} from "../../command-utils/common-options";
import { RECORDING_SNIPPET_PATH } from "../../utils/constants";

export interface RecordCommandHandlerOptions {
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  devTools: boolean | null | undefined;
  bypassCSP: boolean | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  uploadIntervalMs: number | null | undefined;
  incognito: boolean | null | undefined;
  trace: boolean | null | undefined;
  captureHttpOnlyCookies: boolean;
  appUrl: string | null | undefined;
  maxPayloadSize: number | null | undefined;
}

export const recordCommandHandler: (
  options: RecordCommandHandlerOptions
) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  devTools,
  bypassCSP,
  width,
  height,
  uploadIntervalMs,
  incognito,
  trace,
  captureHttpOnlyCookies,
  appUrl,
  maxPayloadSize,
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
  const recordingSnippet = await fetchAsset(RECORDING_SNIPPET_PATH);

  const cookieDir = join(getMeticulousLocalDataDir(), "cookies");

  // Report recording start
  const recordingCommandId = await getRecordingCommandId(client);

  // 5. Start recording
  const onDetectedSession = (sessionId: string) => {
    const organizationName = encodeURIComponent(project.organization.name);
    const projectName = encodeURIComponent(project.name);
    const sessionUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/sessions/${sessionId}`;
    logger.info(`Recording session: ${sessionUrl}`);

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
  };

  await recordSession({
    recordingToken,
    appCommitHash: commitSha,
    devTools,
    bypassCSP,
    recordingSnippet,
    width,
    height,
    uploadIntervalMs,
    incognito,
    cookieDir,
    debugLogger,
    onDetectedSession,
    captureHttpOnlyCookies,
    appUrl,
    maxPayloadSize,
  }).catch((error) => {
    debugLogger?.log(`${error}`);
    throw error;
  });
};

export const recordCommand = buildCommand("record")
  .details({
    describe: "Record a session",
  })
  .options({
    ...COMMON_RECORD_OPTIONS,
    commitSha: OPTIONS.commitSha,
    incognito: {
      boolean: true,
      description: "Use an incognito browsing context",
      default: true,
    },
  })
  .handler(recordCommandHandler);
