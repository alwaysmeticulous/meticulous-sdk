import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { createClient } from "@alwaysmeticulous/client";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "@alwaysmeticulous/downloading-helpers";
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

  // Generate logs.concise.txt and logs.determinstic.txt files
  const logsFile = join(replayFolderFilePath, "logs.ndjson");
  const logsFileExists = await access(logsFile)
    .then(() => true)
    .catch(() => false);
  if (logsFileExists) {
    try {
      const logs = (await readFile(logsFile, "utf8"))
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line));
      let virtualTime = 0;
      const conciseLogs = logs.map(
        (log: {
          source?: "application" | "meticulous";
          type: string | "virtual-time-change";
          virtualTime?: number;
          realTime?: number;
          message: string;
          stackTraceId: number;
        }) => {
          if (log.type === "virtual-time-change" && log.virtualTime != null) {
            virtualTime = log.virtualTime;
            return "";
          }
          if (log.source === "application") {
            return `[trace-id: ${log.stackTraceId}] [virtual: ${virtualTime}ms] [application] ${log.message}`;
          } else {
            return `[trace-id: ${log.stackTraceId}] [virtual: ${virtualTime}ms, real: ${log.realTime}ms] ${log.message}`;
          }
        }
      );
      await writeFile(
        join(replayFolderFilePath, "logs.concise.txt"),
        conciseLogs.join("\n")
      );

      // Useful for diffing one set of logs against another (excludes the real timestamps, which are non-deterministic)
      virtualTime = 0;
      const deterministicLogs = logs.map(
        (log: {
          source?: "application" | "meticulous";
          type: string | "virtual-time-change";
          virtualTime?: number;
          realTime?: number;
          message: string;
          stackTraceId: number;
        }) => {
          if (log.type === "virtual-time-change" && log.virtualTime != null) {
            virtualTime = log.virtualTime;
            return "";
          }
          if (log.source === "application") {
            return `[virtual: ${virtualTime}ms] [application] ${log.message}`;
          } else {
            return `[virtual: ${virtualTime}ms] ${log.message}`;
          }
        }
      );
      await writeFile(
        join(replayFolderFilePath, "logs.deterministic.txt"),
        deterministicLogs.join("\n")
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
