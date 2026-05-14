import { createClientWithOAuth } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  ensureReplayLogTextFiles,
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayId: string;
}

const handler = async ({ apiToken, replayId }: Options): Promise<void> => {
  const logger = initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const { fileName: replayMetadataFileName } = await getOrFetchReplay(
    client,
    replayId,
  );
  logger.info(`Downloaded replay metadata to: ${replayMetadataFileName}`);
  const { fileName: replayFolderFilePath } = await getOrFetchReplayArchive(
    client,
    replayId,
    "everything",
    true,
  );

  await ensureReplayLogTextFiles(replayFolderFilePath);

  logger.info(`Downloaded replay data to: ${replayFolderFilePath}`);
};

export const downloadReplayCommand: CommandModule<unknown, Options> = {
  command: "replay",
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
  handler: wrapHandler(handler),
};
