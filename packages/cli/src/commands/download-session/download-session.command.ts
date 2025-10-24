import { createClient } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "@alwaysmeticulous/downloading-helpers";
import { buildCommand } from "../../command-utils/command-builder";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  sessionId,
}) => {
  const logger = initLogger();
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
