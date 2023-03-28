import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "@alwaysmeticulous/download-helpers";
import log from "loglevel";
import { createClient } from "../../../../client/src/client";
import { buildCommand } from "../../command-utils/command-builder";

interface Options {
  apiToken?: string | null | undefined;
  replayId: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  replayId,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = createClient({ apiToken });

  const { fileName: replayMetadataFileName } = await getOrFetchReplay(
    client,
    replayId
  );
  logger.info(`Downloaded replay metadata to: ${replayMetadataFileName}`);
  const { fileName: replayFolderFilePath } = await getOrFetchReplayArchive(
    client,
    replayId
  );
  logger.info(`Downloaded replay data to: ${replayFolderFilePath}`);
};

export const downloadReplayCommand = buildCommand("download-simulation")
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
