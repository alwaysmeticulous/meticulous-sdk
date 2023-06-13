import { readFileSync, writeFileSync } from "fs";
import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { createClient } from "@alwaysmeticulous/client";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "@alwaysmeticulous/downloading-helpers";
import { fileExists } from "@alwaysmeticulous/downloading-helpers/dist/file-downloads/local-data.utils";
import log from "loglevel";
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

  // Generate logs.concise.txt file
  const logsFile = join(replayFolderFilePath, "logs.json");
  const logsFileExists = await access(logsFile)
    .then(() => true)
    .catch(() => false);
  if (logsFileExists) {
    try {
      const logs = JSON.parse(
        await readFile(join(replayFolderFilePath, "logs.json"), "utf8")
      );
      const conciseLogs = logs.console.map(
        (log: { type: string; message: string }) => {
          return log.message.replace("[METICULOUS] ", "");
        }
      );
      await writeFile(
        join(replayFolderFilePath, "logs.concise.txt"),
        conciseLogs.join("\n")
      );
    } catch (err) {
      logger.error("Error creating concise version of logs file", err);
    }
  }

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
