import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { ConsoleMessageWithStackTracePointer } from "@alwaysmeticulous/api";
import { createClientWithOAuth } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
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
        },
      );
      await writeFile(
        join(replayFolderFilePath, "logs.concise.txt"),
        conciseLogs.join("\n"),
      );

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

          // Event ids are unstable so filter them out to minimize noise
          const message = log.message.startsWith("Executing event")
            ? log.message.replace(/"id": ?\d+/g, '"id": "<non-deterministic>"')
            : log.message;

          const commonPostfix = `${
            log.repetitionCount ? " [x" + log.repetitionCount + "]" : ""
          } ${message}`;

          if (log.source === "application") {
            return [
              `[virtual: ${virtualTime}ms] [application]${commonPostfix}`,
            ];
          } else {
            return [`[virtual: ${virtualTime}ms]${commonPostfix}`];
          }
        },
      );
      await writeFile(
        join(replayFolderFilePath, "logs.deterministic.txt"),
        deterministicLogs.join("\n"),
      );
    } catch (err) {
      logger.error("Error creating concise version of logs file", err);
    }
  }

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
