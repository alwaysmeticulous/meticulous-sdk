import {
  StructuredSessionSummary,
  createClientWithOAuth,
  getStructuredSessionData,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  writeStructuredSessionData,
  writeManifest,
} from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { DEFAULT_STRUCTURED_SESSION_OUTPUT_DIR } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  sessionIds: string;
  outputDir: string;
}

const downloadSingleSession = async (
  client: MeticulousClient,
  sessionId: string,
  outputDir: string,
  logger: ReturnType<typeof initLogger>,
): Promise<StructuredSessionSummary | null> => {
  try {
    const sessionData = await getStructuredSessionData(client, sessionId);
    await writeStructuredSessionData({ outputDir, sessionData });
    logger.info(`  Downloaded session ${sessionId}`);
    return sessionData.summary;
  } catch (error) {
    logger.error(`  Failed to download session ${sessionId}: ${error}`);
    return null;
  }
};

export const downloadSessionsCommand: CommandModule<unknown, Options> = {
  command: "sessions",
  describe:
    "Download multiple recorded sessions in agent-friendly structured format",
  builder: {
    apiToken: {
      string: true,
    },
    sessionIds: {
      string: true,
      demandOption: true,
      description: "Comma-separated list of session IDs to download",
    },
    outputDir: {
      string: true,
      description: "Output directory for session data",
      default: DEFAULT_STRUCTURED_SESSION_OUTPUT_DIR,
    },
  },
  handler: wrapHandler(async ({ apiToken, sessionIds, outputDir }) => {
    const logger = initLogger();
    const client = await createClientWithOAuth({
      apiToken,
      enableOAuthLogin: true,
    });

    const ids = sessionIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      logger.error("No session IDs provided.");
      process.exit(1);
    }

    logger.info(
      `Downloading ${ids.length} sessions to ${outputDir}...`,
    );

    const summaries = await Promise.all(
      ids.map((id) =>
        downloadSingleSession(client, id, outputDir, logger),
      ),
    );

    const validSummaries = summaries.filter(
      (s): s is StructuredSessionSummary => s != null,
    );

    await writeManifest(outputDir, validSummaries);

    logger.info(
      `Session data written to ${outputDir}/ (${validSummaries.length}/${ids.length} sessions)`,
    );
  }),
};
