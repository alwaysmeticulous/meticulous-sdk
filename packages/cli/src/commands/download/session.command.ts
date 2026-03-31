import {
  createClientWithOAuth,
  getStructuredSessionData,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
  writeStructuredSessionData,
  writeManifestAndReadme,
} from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { DEFAULT_STRUCTURED_SESSION_OUTPUT_DIR } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";

type DownloadFormat = "raw" | "agent-friendly";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
  format?: DownloadFormat;
  outputDir?: string;
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
    },
    format: {
      choices: ["raw", "agent-friendly"] as const,
      default: "raw" as DownloadFormat,
      description:
        'Output format: "raw" downloads the original JSON, "agent-friendly" writes a structured directory tree',
    },
    outputDir: {
      string: true,
      description:
        'Output directory for agent-friendly format (default: ".meticulous/agent-sessions")',
    },
  },
  handler: wrapHandler(async ({ apiToken, sessionId, format, outputDir }) => {
    const logger = initLogger();
    const client = await createClientWithOAuth({
      apiToken,
      enableOAuthLogin: true,
    });

    if (format === "agent-friendly") {
      const resolvedOutputDir = outputDir ?? DEFAULT_STRUCTURED_SESSION_OUTPUT_DIR;
      logger.info(
        `Downloading session ${sessionId} in agent-friendly format...`,
      );

      const sessionData = await getStructuredSessionData(
        client,
        sessionId,
      );
      await writeStructuredSessionData({
        outputDir: resolvedOutputDir,
        sessionData,
      });
      await writeManifestAndReadme(resolvedOutputDir, [sessionData.summary]);

      logger.info(
        `Session data written to ${resolvedOutputDir}/sessions/${sessionId}/`,
      );
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
