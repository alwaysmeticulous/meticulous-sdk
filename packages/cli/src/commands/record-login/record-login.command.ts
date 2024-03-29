import { createClient, getProject } from "@alwaysmeticulous/client";
import { DebugLogger, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import { recordLoginFlowSession } from "@alwaysmeticulous/record";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";
import { COMMON_RECORD_OPTIONS } from "../../command-utils/common-options";
import { RECORDING_SNIPPET_PATH } from "../../utils/constants";

export interface RecordCommandHandlerOptions {
  apiToken: string | null | undefined;
  devTools: boolean | null | undefined;
  bypassCSP: boolean | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  uploadIntervalMs: number | null | undefined;
  trace: boolean | null | undefined;
  captureHttpOnlyCookies: boolean;
  appUrl: string | null | undefined;
}

export const recordLoginFlowCommandHandler: (
  options: RecordCommandHandlerOptions
) => Promise<void> = async ({
  apiToken,
  devTools,
  bypassCSP,
  width,
  height,
  uploadIntervalMs,
  trace,
  captureHttpOnlyCookies,
  appUrl,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const debugLogger = trace ? await DebugLogger.create() : null;
  debugLogger?.log("Record options:");
  debugLogger?.logObject({
    apiToken,
    devTools,
    width,
    height,
    uploadIntervalMs,
    trace,
  });

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

  // 3. Load recording snippets
  const recordingSnippet = await fetchAsset(RECORDING_SNIPPET_PATH);

  // 4. Start recording
  await recordLoginFlowSession({
    recordingToken,
    devTools,
    bypassCSP,
    recordingSnippet,
    width,
    height,
    uploadIntervalMs,
    captureHttpOnlyCookies,
    appUrl,
  }).catch((error) => {
    throw error;
  });
};

export const recordLoginCommand = buildCommand("record-login")
  .details({
    describe:
      "Record a login flow session (warning: sessions recorded with this command will store credentials)",
  })
  .options({
    ...COMMON_RECORD_OPTIONS,

    // We explicitly set the default to true for this command.
    bypassCSP: {
      ...COMMON_RECORD_OPTIONS.bypassCSP,
      default: true,
    },
  })
  .handler(recordLoginFlowCommandHandler);
