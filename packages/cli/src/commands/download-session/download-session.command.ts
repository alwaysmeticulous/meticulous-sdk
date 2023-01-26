import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../../api/client";
import { buildCommand } from "../../command-utils/command-builder";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  sessionId,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = createClient({ apiToken });

  const { fileName: sessionMetadataFileName } = await getOrFetchRecordedSession(
    client,
    sessionId
  );
  logger.info(`Downloaded session metadata to: ${sessionMetadataFileName}`);
  const { fileName: sessionFileName } = await getOrFetchRecordedSessionData(
    client,
    sessionId
  );
  logger.info(`Downloaded session data to: ${sessionFileName}`);
};

export const downloadSessionCommand = buildCommand("download-session")
  .details({
    describe: "Download recorded session from Meticulous",
  })
  .options({
    apiToken: {
      string: true,
    },
    sessionId: {
      string: true,
      demandOption: true,
    },
  })
  .handler(handler);
