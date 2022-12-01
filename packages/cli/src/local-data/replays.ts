import { mkdir, opendir, rm } from "fs/promises";
import { join } from "path";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  Replay,
} from "@alwaysmeticulous/common";
import Zip from "adm-zip";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { downloadFile } from "../api/download";
import { getReplay, getReplayDownloadUrl } from "../api/replay.api";
import {
  fileExists,
  getOrDownloadJsonFile,
  waitToAcquireLockOnDirectory,
} from "./local-data.utils";

export const getOrFetchReplay = async (
  client: AxiosInstance,
  replayId: string
): Promise<Replay> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayFile = join(getReplayDir(replayId), `${replayId}.json`);

  const replay = await getOrDownloadJsonFile({
    filePath: replayFile,
    dataDescription: "replay",
    downloadJson: () => getReplay(client, replayId),
  });

  if (!replay) {
    logger.error(
      `Error: Could not retrieve replay with id "${replayId}". Is the API token correct?`
    );
    process.exit(1);
  }

  return replay;
};

export const getOrFetchReplayArchive = async (
  client: AxiosInstance,
  replayId: string
): Promise<void> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayDir = getReplayDir(replayId);
  await mkdir(replayDir, { recursive: true });
  const releaseLock = await waitToAcquireLockOnDirectory(replayDir);

  try {
    const replayArchiveFile = join(replayDir, `${replayId}.zip`);
    const paramsFile = join(replayDir, "replayEventsParams.json");

    // Check if "replayEventsParams.json" exists. If yes, we assume the replay
    // zip archive has been downloaded and extracted.
    if (await fileExists(paramsFile)) {
      logger.debug(`Replay archive already downloaded at ${replayDir}`);
      return;
    }

    const downloadUrlData = await getReplayDownloadUrl(client, replayId);
    if (!downloadUrlData) {
      logger.error(
        "Error: Could not retrieve replay archive URL. This may be an invalid replay"
      );
      await releaseLock();
      process.exit(1);
    }

    await downloadFile(downloadUrlData.dowloadUrl, replayArchiveFile);

    const zipFile = new Zip(replayArchiveFile);
    zipFile.extractAllTo(replayDir, /*overwrite=*/ true);
    await rm(replayArchiveFile);

    logger.debug(`Extracted replay archive in ${replayDir}`);
  } finally {
    await releaseLock();
  }
};

export const getScreenshotFiles: (
  screenshotsDirPath: string
) => Promise<string[]> = async (screenshotsDirPath) => {
  const screenshotFiles = [];
  const screenshotsDir = await opendir(screenshotsDirPath);

  for await (const dirEntry of screenshotsDir) {
    if (dirEntry.isFile() && dirEntry.name.endsWith(".png")) {
      screenshotFiles.push(dirEntry.name);
    }
  }

  // Sort files alphabetically to help when reading results.
  return screenshotFiles.sort();
};

export const getSnapshottedAssetsDir = (replayId: string) =>
  join(getReplayDir(replayId), "snapshotted-assets");

export const getScreenshotsDir = (replayDir: string) =>
  join(replayDir, "screenshots");

export const getReplayDir = (replayId: string) =>
  join(getMeticulousLocalDataDir(), "replays", replayId);
