import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { ConsoleMessageWithStackTracePointer } from "@alwaysmeticulous/api";
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
    replayId,
    "everything",
    true
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
        (log: ConsoleMessageWithStackTracePointer) => {
          if (log.type === "virtual-time-change") {
            virtualTime = log.virtualTime;
            return "";
          }
          const commonPostfix = `${
            log.repetitionCount ? " [x" + log.repetitionCount + "]" : ""
          } ${log.message}`;
          if (log.source === "application") {
            return `[trace-id: ${log.stackTraceId}] [virtual: ${virtualTime}ms] [application]${commonPostfix}`;
          } else {
            return `[trace-id: ${log.stackTraceId}] [virtual: ${virtualTime}ms, real: ${log.realTime}ms]${commonPostfix}`;
          }
        }
      );
      await writeFile(
        join(replayFolderFilePath, "logs.concise.txt"),
        conciseLogs.join("\n")
      );

      // Useful for diffing one set of logs against another (excludes the real timestamps, which are non-deterministic)
      virtualTime = 0;
      const deterministicLogs = logs.flatMap(
        (log: ConsoleMessageWithStackTracePointer) => {
          if (log.type === "virtual-time-change") {
            virtualTime = log.virtualTime;
            return [""];
          }

          if (log.message.includes("[non-deterministic]")) {
            return [];
          }

          // Event ids are unstable (one difference at the start of a replay can affect all subsequent event ids) and so we
          // filter them out to minimize noise
          const message = log.message.startsWith("Executing event")
            ? log.message.replace(/"id": ?\d+/g, '"id": "<non-deterministic>"')
            : log.message;

          const commonPostfix = `${
            log.repetitionCount ? " [x" + log.repetitionCount + "]" : ""
          } ${message}`;

          if (log.source === "application") {
            // Application logs are not guaranteed to be deterministic since code can get executed e.g. when a script loads,
            // but they are low volume and high signal so we include them anyway
            return [
              `[virtual: ${virtualTime}ms] [application]${commonPostfix}`,
            ];
          } else {
            return [`[virtual: ${virtualTime}ms]${commonPostfix}`];
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
