import { createClient } from "../../api/client";
import { buildCommand } from "../../command-utils/command-builder";
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

export const downloadReplay = buildCommand("download-simulation")
  .details({
    aliases: ["download-replay"],
    describe: "Download a simulation from Meticulous",
  })
  .options({
    apiToken: {
      string: true,
    },
    replayId: {
      string: true,
      demandOption: true,
    },
  })
  .handler(handler);
