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
  initLogger,
} from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import { recordSession } from "@alwaysmeticulous/record";
import { CommandModule } from "yargs";
import { COMMON_RECORD_OPTIONS, OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { RECORDING_SNIPPET_PATH } from "../../utils/constants";

interface Options {
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

const handler = async ({
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
}: Options): Promise<void> => {
  const logger = initLogger();
  const debugLogger = trace ? await DebugLogger.create() : null;

  logger.info("Preparing recording...");

  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const recordingToken = project.recordingToken;
  if (!recordingToken) {
    logger.error("Could not retrieve recording token.");
    process.exit(1);
  }

  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  const recordingSnippet = await fetchAsset(RECORDING_SNIPPET_PATH);
  const cookieDir = join(getMeticulousLocalDataDir(), "cookies");
  const recordingCommandId = await getRecordingCommandId(client);

  const onDetectedSession = (sessionId: string) => {
    const organizationName = encodeURIComponent(project.organization.name);
    const projectName = encodeURIComponent(project.name);
    const sessionUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/sessions/${sessionId}`;
    logger.info(`Recording session: ${sessionUrl}`);

    postSessionIdNotification(client, sessionId, recordingCommandId).catch(
      (error) => {
        logger.error(
          `Warning: error while notifying session recording ${sessionId}`,
        );
        logger.error(error);
        debugLogger?.log(
          `Warning: error while notifying session recording ${sessionId}`,
        );
        debugLogger?.log(`${error}`);
      },
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

export const recordSessionCommand: CommandModule<unknown, Options> = {
  command: "session",
  describe: "Record a session",
  builder: {
    ...COMMON_RECORD_OPTIONS,
    commitSha: OPTIONS.commitSha,
    incognito: {
      boolean: true,
      description: "Use an incognito browsing context",
      default: true,
    },
  },
  handler: wrapHandler(handler),
};
