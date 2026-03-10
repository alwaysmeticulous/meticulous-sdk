import { createClientWithOAuth } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
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
  },
  handler: wrapHandler(async ({ apiToken, sessionId }) => {
    const logger = initLogger();
    const client = await createClientWithOAuth({
      apiToken,
      enableOAuthLogin: true,
    });

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
