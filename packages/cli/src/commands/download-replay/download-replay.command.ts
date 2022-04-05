import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "../../local-data/replays";

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

export const downloadReplay: CommandModule<{}, Options> = {
  command: "download-replay",
  describe: "Download a replay from Meticulous",
  builder: {
    apiToken: {
      string: true,
    },
    replayId: {
      string: true,
      demandOption: true,
    },
  },
  handler,
};
