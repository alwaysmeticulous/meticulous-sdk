import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  getReplayDiff,
  getPrDiff,
  getTestRun,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import {
  getOrFetchReplayArchive,
  getOrFetchRecordedSessionData,
} from "@alwaysmeticulous/downloading-helpers";
import chalk from "chalk";
import pLimit from "p-limit";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import { DebugContext } from "./debug.types";

const REPLAY_SKIP_DIRS = new Set(["screenshots"]);
const DEFAULT_MAX_REPLAY_DOWNLOADS = 8;

export interface DownloadDebugDataOptions {
  client: MeticulousClient;
  debugContext: DebugContext;
  workspaceDir: string;
  maxConcurrentDownloads?: number | undefined;
  additionalDownloads?:
    | ((
        debugContext: DebugContext,
        debugDataDir: string,
      ) => void | Promise<void>)
    | undefined;
}

export const downloadDebugData = async (
  options: DownloadDebugDataOptions,
): Promise<void> => {
  const { client, debugContext, workspaceDir } = options;
  const maxConcurrency =
    options.maxConcurrentDownloads ?? DEFAULT_MAX_REPLAY_DOWNLOADS;

  const debugDataDir = join(workspaceDir, DEBUG_DATA_DIRECTORY);
  mkdirSync(debugDataDir, { recursive: true });

  await Promise.all([
    downloadReplays(client, debugContext, debugDataDir, maxConcurrency),
    downloadSessionData(client, debugContext, debugDataDir, maxConcurrency),
    downloadReplayDiffs(client, debugContext, debugDataDir, maxConcurrency),
    downloadTestRunMetadata(client, debugContext, debugDataDir),
    downloadPrDiffFromApi(client, debugContext, debugDataDir),
    options.additionalDownloads?.(debugContext, debugDataDir),
  ]);
};

const downloadReplays = async (
  client: MeticulousClient,
  debugContext: DebugContext,
  debugDataDir: string,
  maxConcurrency: number,
): Promise<void> => {
  const headReplayIds = new Set(
    debugContext.replayDiffs.map((d) => d.headReplayId),
  );
  const baseReplayIds = new Set(
    debugContext.replayDiffs.map((d) => d.baseReplayId),
  );

  console.log(
    chalk.cyan(`  Downloading ${debugContext.replayIds.length} replays...`),
  );

  const limit = pLimit(maxConcurrency);
  const results = await Promise.all(
    debugContext.replayIds.map((replayId) =>
      limit(async () => {
        const { fileName: cachedPath } = await getOrFetchReplayArchive(
          client,
          replayId,
          "everything",
          true,
        );
        console.log(chalk.cyan(`  Downloaded replay ${replayId}`));
        return { replayId, cachedPath };
      }),
    ),
  );

  for (const { replayId, cachedPath } of results) {
    const isHead = headReplayIds.has(replayId);
    const isBase = baseReplayIds.has(replayId);
    const subDir = isHead ? "head" : isBase ? "base" : "other";

    const destDir = join(debugDataDir, "replays", subDir, replayId);
    if (!existsSync(destDir)) {
      copyReplayDir(cachedPath, destDir);
    }
  }
};

const copyReplayDir = (src: string, dest: string): void => {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!REPLAY_SKIP_DIRS.has(entry.name)) {
        cpSync(srcPath, destPath, { recursive: true });
      }
    } else {
      cpSync(srcPath, destPath);
    }
  }
};

const downloadSessionData = async (
  client: MeticulousClient,
  debugContext: DebugContext,
  debugDataDir: string,
  maxConcurrency: number,
): Promise<void> => {
  if (debugContext.sessionIds.length === 0) {
    return;
  }

  const limit = pLimit(maxConcurrency);
  await Promise.all(
    debugContext.sessionIds.map((sessionId) =>
      limit(async () => {
        console.log(chalk.cyan(`  Downloading session ${sessionId}...`));
        const { data: sessionData } = await getOrFetchRecordedSessionData(
          client,
          sessionId,
        );
        const sessionDir = join(debugDataDir, "sessions", sessionId);
        mkdirSync(sessionDir, { recursive: true });
        writeFileSync(
          join(sessionDir, "data.json"),
          JSON.stringify(sessionData, null, 2),
        );
      }),
    ),
  );
};

const downloadReplayDiffs = async (
  client: MeticulousClient,
  debugContext: DebugContext,
  debugDataDir: string,
  maxConcurrency: number,
): Promise<void> => {
  if (debugContext.replayDiffs.length === 0) {
    return;
  }

  const diffsDir = join(debugDataDir, "diffs");
  mkdirSync(diffsDir, { recursive: true });

  const limit = pLimit(maxConcurrency);
  await Promise.all(
    debugContext.replayDiffs.map((diff) =>
      limit(async () => {
        console.log(chalk.cyan(`  Downloading replay diff ${diff.id}...`));
        const diffData = await getReplayDiff(client, diff.id);
        writeFileSync(
          join(diffsDir, `${diff.id}.json`),
          JSON.stringify(diffData, null, 2),
        );
      }),
    ),
  );
};

const downloadTestRunMetadata = async (
  client: MeticulousClient,
  debugContext: DebugContext,
  debugDataDir: string,
): Promise<void> => {
  if (!debugContext.testRunId) {
    return;
  }

  const testRunDir = join(debugDataDir, "test-run");
  mkdirSync(testRunDir, { recursive: true });

  console.log(
    chalk.cyan(`  Downloading test run ${debugContext.testRunId}...`),
  );
  const testRun = await getTestRun({
    client,
    testRunId: debugContext.testRunId,
  });
  writeFileSync(
    join(testRunDir, `${debugContext.testRunId}.json`),
    JSON.stringify(testRun, null, 2),
  );
};

const downloadPrDiffFromApi = async (
  client: MeticulousClient,
  debugContext: DebugContext,
  debugDataDir: string,
): Promise<void> => {
  if (!debugContext.testRunId) {
    return;
  }

  console.log(chalk.cyan(`  Downloading PR diff...`));
  try {
    const response = await getPrDiff({
      client,
      testRunId: debugContext.testRunId,
    });
    if (response.content && response.content.trim()) {
      writeFileSync(join(debugDataDir, "pr-diff.txt"), response.content);
    }
  } catch (error: any) {
    const status = error?.response?.status;
    const serverMessage = error?.response?.data?.message;
    const detail = serverMessage
      ? `${status ?? "unknown"}: ${serverMessage}`
      : error instanceof Error
        ? error.message
        : String(error);
    console.warn(
      chalk.yellow(`  Warning: Could not download PR diff (${detail}).`),
    );
  }
};
