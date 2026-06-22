import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { ConsoleMessageWithStackTracePointer } from "@alwaysmeticulous/api";
import { initLogger } from "@alwaysmeticulous/common";

const LOGS_NDJSON = "logs.ndjson";
const LOGS_CONCISE = "logs.concise.txt";
const LOGS_DETERMINISTIC = "logs.deterministic.txt";

const fileExists = async (path: string): Promise<boolean> => {
  return access(path)
    .then(() => true)
    .catch(() => false);
};

/**
 * Idempotently writes `logs.concise.txt` and `logs.deterministic.txt` next to
 * `logs.ndjson` in the given replay directory.
 *
 * - No-op if `logs.ndjson` is missing (older replays may not have it).
 * - No-op if both text files already exist.
 * - Errors during transformation are logged but not thrown — the .txt files
 *   are convenience artifacts; missing them shouldn't fail the download.
 */
export const ensureReplayLogTextFiles = async (
  replayDir: string,
): Promise<void> => {
  const logger = initLogger();

  const ndjsonPath = join(replayDir, LOGS_NDJSON);
  if (!(await fileExists(ndjsonPath))) {
    return;
  }

  const concisePath = join(replayDir, LOGS_CONCISE);
  const deterministicPath = join(replayDir, LOGS_DETERMINISTIC);
  if (
    (await fileExists(concisePath)) &&
    (await fileExists(deterministicPath))
  ) {
    return;
  }

  try {
    const logs = (await readFile(ndjsonPath, "utf8"))
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as ConsoleMessageWithStackTracePointer);

    await writeFile(concisePath, formatConciseLogs(logs));
    await writeFile(deterministicPath, formatDeterministicLogs(logs));
  } catch (err) {
    logger.error(
      `Error generating concise/deterministic log files in ${replayDir}`,
      err,
    );
  }
};

const formatConciseLogs = (
  logs: ConsoleMessageWithStackTracePointer[],
): string => {
  let virtualTime = 0;
  const lines = logs.map((log) => {
    if (log.type === "virtual-time-change") {
      virtualTime = log.virtualTime;
      return "";
    }
    const commonPostfix = `${
      log.repetitionCount ? " [x" + log.repetitionCount + "]" : ""
    } ${log.message}`;
    if (log.source === "application") {
      return `[trace-id: ${log.stackTraceId}] [virtual: ${virtualTime}ms] [application]${commonPostfix}`;
    }
    return `[trace-id: ${log.stackTraceId}] [virtual: ${virtualTime}ms, real: ${log.realTime}ms]${commonPostfix}`;
  });
  return lines.join("\n");
};

const formatDeterministicLogs = (
  logs: ConsoleMessageWithStackTracePointer[],
): string => {
  let virtualTime = 0;
  const lines = logs.flatMap((log) => {
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
      return [`[virtual: ${virtualTime}ms] [application]${commonPostfix}`];
    }
    return [`[virtual: ${virtualTime}ms]${commonPostfix}`];
  });
  return lines.join("\n");
};
