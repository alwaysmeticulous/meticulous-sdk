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
  const client = createClient({ apiToken });

  await getOrFetchRecordedSession(client, sessionId);
  await getOrFetchRecordedSessionData(client, sessionId);
};

export const downloadSession = buildCommand("download-session")
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
