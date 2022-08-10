import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "../../local-data/replays";
import { wrapHandler } from "../../utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayId: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  replayId,
}) => {
  const client = createClient({ apiToken });

  await getOrFetchReplay(client, replayId);
  await getOrFetchReplayArchive(client, replayId);
};

export const downloadReplay: CommandModule<unknown, Options> = {
  command: "download-simulation",
  aliases: ["download-replay"],
  describe: "Download a simulation from Meticulous",
  builder: {
    apiToken: {
      string: true,
    },
    replayId: {
      string: true,
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
