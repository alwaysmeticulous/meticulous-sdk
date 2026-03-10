import { createClient, getProject } from "@alwaysmeticulous/client";
import { DebugLogger, initLogger } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import { recordLoginFlowSession } from "@alwaysmeticulous/record";
import { CommandModule } from "yargs";
import { COMMON_RECORD_OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { RECORDING_SNIPPET_PATH } from "../../utils/constants";

interface Options {
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

const handler = async ({
  apiToken,
  devTools,
  bypassCSP,
  width,
  height,
  uploadIntervalMs,
  trace,
  captureHttpOnlyCookies,
  appUrl,
}: Options): Promise<void> => {
  const logger = initLogger();
  const debugLogger = trace ? await DebugLogger.create() : null;

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

  const recordingSnippet = await fetchAsset(RECORDING_SNIPPET_PATH);

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
    debugLogger?.log(`${error}`);
    throw error;
  });
};

export const recordLoginCommand: CommandModule<unknown, Options> = {
  command: "login",
  describe:
    "Record a login flow session (warning: sessions recorded with this command will store credentials)",
  builder: {
    ...COMMON_RECORD_OPTIONS,
    // We explicitly set the default to true for this command.
    bypassCSP: {
      ...COMMON_RECORD_OPTIONS.bypassCSP,
      default: true,
    },
  },
  handler: wrapHandler(handler),
};
