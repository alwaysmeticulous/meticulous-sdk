import { createClient, getProject } from "@alwaysmeticulous/client";
import { DebugLogger, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import { recordLoginFlowSession } from "@alwaysmeticulous/record";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";

export interface RecordCommandHandlerOptions {
  apiToken: string | null | undefined;
  devTools: boolean | null | undefined;
  bypassCSP: boolean | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  uploadIntervalMs: number | null | undefined;
  trace: boolean | null | undefined;
  captureHttpOnlyCookies: boolean;
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
  const recordingSnippet = await fetchAsset("v1/meticulous.js");
  const earlyNetworkRecorderSnippet = await fetchAsset(
    "record/v1/network-recorder.bundle.js"
  );

  // 4. Start recording
  await recordLoginFlowSession({
    recordingToken,
    devTools,
    bypassCSP,
    recordingSnippet,
    earlyNetworkRecorderSnippet,
    width,
    height,
    uploadIntervalMs,
    captureHttpOnlyCookies,
  }).catch((error) => {
    throw error;
  });
};

export const recordLoginFlowCommand = buildCommand("record-login-flow")
  .details({
    describe: "Record a login flow session",
  })
  .options({
    apiToken: {
      string: true,
      demandOption: false,
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
    trace: {
      boolean: true,
      description: "Enable verbose logging",
    },
    captureHttpOnlyCookies: {
      boolean: true,
      default: true,
      description: "Capture http-only cookies in addition to regular cookies",
    },
  })
  .handler(recordLoginFlowCommandHandler);
