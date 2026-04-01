import { createClientWithOAuth } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
  writeManifest,
} from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { DEFAULT_SESSION_OUTPUT_DIR } from "../../command-utils/common-options";
import { downloadSingleSession } from "../../command-utils/download-session.utils";
import { wrapHandler } from "../../command-utils/sentry.utils";

type DownloadFormat = "json" | "multi-file";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
  format: DownloadFormat;
  outputDir: string;
}

export const downloadSessionCommand: CommandModule<unknown, Options> = {
  command: "session",
  describe: "Download a recorded session from Meticulous",
  builder: {
    apiToken: {
      string: true,
    },
    sessionId: {
      string: true,
      demandOption: true,
      description: "ID of the session to download",
    },
    format: {
      choices: ["json", "multi-file"] as const,
      default: "json" as DownloadFormat,
      description:
        '"json" downloads the original single JSON file, "multi-file" writes a structured directory tree',
    },
    outputDir: {
      string: true,
      description: "Output directory for multi-file format",
      default: DEFAULT_SESSION_OUTPUT_DIR,
    },
  },
  handler: wrapHandler(async ({ apiToken, sessionId, format, outputDir }) => {
    const logger = initLogger();
    const client = await createClientWithOAuth({
      apiToken,
      enableOAuthLogin: true,
    });

    if (format === "multi-file") {
      logger.info(`Downloading session ${sessionId} in multi-file format...`);

      const summary = await downloadSingleSession(
        client,
        sessionId,
        outputDir,
        logger,
      );

      await writeManifest(outputDir, [summary]);
      logger.info(`Session data written to ${outputDir}/`);
      return;
    }

    const { fileName: sessionMetadataFileName } =
      await getOrFetchRecordedSession(client, sessionId);
    logger.info(`Downloaded session metadata to: ${sessionMetadataFileName}`);
    const { fileName: sessionFileName } = await getOrFetchRecordedSessionData(
      client,
      sessionId,
    );
    logger.info(`Downloaded session data to: ${sessionFileName}`);
  }),
};
