import { fstat } from "fs";
import { opendir, access, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import Zip from "adm-zip";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { lock, unlock } from "proper-lockfile";
import { downloadFile } from "../api/download";
import { getReplay, getReplayDownloadUrl } from "../api/replay.api";

export const getOrFetchReplay: (
  client: AxiosInstance,
  replayId: string
) => Promise<any> = async (client, replayId) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayDir = getReplayDir(replayId);
  await mkdir(replayDir, { recursive: true });
  const replayFile = join(replayDir, `${replayId}.json`);

  const existingReplay = await readFile(replayFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingReplay) {
    logger.debug(`Reading replay from local copy in ${replayFile}`);
    return existingReplay;
  }

  const replay = await getReplay(client, replayId);
  if (!replay) {
    logger.error(
      `Error: Could not retrieve replay with id "${replayId}". Is the API token correct?`
    );
    process.exit(1);
  }

  await writeFile(replayFile, JSON.stringify(replay, null, 2));
  logger.debug(`Wrote replay to ${replayFile}`);
  return replay;
};

export const getOrFetchReplayArchive: (
  client: AxiosInstance,
  replayId: string
) => Promise<void> = async (client, replayId) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayDir = getReplayDir(replayId);
  const lockfilePath = join(replayDir, "dir.lock");
  await mkdir(replayDir, { recursive: true });

  // Create a lock file so that if multiple processes try downloading at the same
  // time they don't interfere with each other. The second process to run will
  // wait for the first process to complete, and then return straight away because
  // it'll notice the replayEventsParams.json file exists.
  const releaseLock = await lock(replayDir, {
    retries: {
      retries: 1000, // We want to keep on retrying till we get the maxRetryTime, so we set this to a high value
      factor: 1.05,
      minTimeout: 500,
      maxTimeout: 2000,
      // Wait a maximum of 120s for the other process to finish downloading and extracting the file
      maxRetryTime: 120 * 1000,
      randomize: true,
    },
    lockfilePath,
  });

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

const fileExists = (filePath: string) =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

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
