import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import Zip from "adm-zip";
import { AxiosInstance } from "axios";
import { opendir } from "fs/promises";
import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import log from "loglevel";
import { join } from "path";
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
  await mkdir(replayDir, { recursive: true });
  const replayArchiveFile = join(replayDir, `${replayId}.zip`);
  const paramsFile = join(replayDir, "replayEventsParams.json");

  // Check if "replayEventsParams.json" exists. If yes, we assume the replay
  // zip archive has been downloaded and extracted.
  const paramsFileExists = await access(paramsFile)
    .then(() => true)
    .catch(() => false);
  if (paramsFileExists) {
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

  logger.debug(`Exrtracted replay archive in ${replayDir}`);
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
