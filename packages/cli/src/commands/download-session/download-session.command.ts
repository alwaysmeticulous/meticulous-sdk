import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
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

export const downloadSession: CommandModule<{}, Options> = {
  command: "download-session",
  describe: "Download recorded session from Meticulous",
  builder: {
    apiToken: {
      string: true,
    },
    sessionId: {
      string: true,
      demandOption: true,
    },
  },
  handler,
};
