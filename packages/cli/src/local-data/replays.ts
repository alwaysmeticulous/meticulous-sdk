import Zip from "adm-zip";
import { AxiosInstance } from "axios";
import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { PNG } from "pngjs";
import { downloadFile } from "../api/download";
import { getReplay, getReplayDownloadUrl } from "../api/replay.api";
import { readPng } from "../image/io.utils";
import { getMeticulousLocalDataDir } from "./local-data";

export const getOrFetchReplay: (
  client: AxiosInstance,
  replayId: string
) => Promise<any> = async (client, replayId) => {
  const replayDir = join(getMeticulousLocalDataDir(), "replays", replayId);
  await mkdir(replayDir, { recursive: true });
  const replayFile = join(replayDir, `${replayId}.json`);

  const existingReplay = await readFile(replayFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingReplay) {
    console.log(`Reading replay from local copy in ${replayFile}`);
    return existingReplay;
  }

  const replay = await getReplay(client, replayId);
  if (!replay) {
    console.error(
      "Error: Could not retrieve replay. Is the API token correct?"
    );
    process.exit(1);
  }

  await writeFile(replayFile, JSON.stringify(replay, null, 2));
  console.log(`Wrote replay to ${replayFile}`);
  return replay;
};

export const getOrFetchReplayArchive: (
  client: AxiosInstance,
  replayId: string
) => Promise<void> = async (client, replayId) => {
  const replayDir = join(getMeticulousLocalDataDir(), "replays", replayId);
  await mkdir(replayDir, { recursive: true });
  const replayArchiveFile = join(replayDir, `${replayId}.zip`);
  const paramsFile = join(replayDir, "replayEventsParams.json");

  // Check if "replayEventsParams.json" exists. If yes, we assume the replay
  // zip archive has been downloaded and extracted.
  const paramsFileExists = await access(paramsFile)
    .then(() => true)
    .catch(() => false);
  if (paramsFileExists) {
    console.log(`Replay archive already downloaded at ${replayDir}`);
    return;
  }

  const dowloadUrlData = await getReplayDownloadUrl(client, replayId);
  if (!dowloadUrlData) {
    console.error(
      "Error: Could not retrieve replay archive URL. This may be an invalid replay"
    );
    process.exit(1);
  }

  await downloadFile(dowloadUrlData.dowloadUrl, replayArchiveFile);
  const zipFile = new Zip(replayArchiveFile);
  zipFile.extractAllTo(replayDir, /*overwrite=*/ true);
  await rm(replayArchiveFile);

  console.log(`Exrtracted replay archive in ${replayDir}`);
};

export const readReplayScreenshot: (replayId: string) => Promise<PNG> = async (
  replayId
) => {
  const replayDir = join(getMeticulousLocalDataDir(), "replays", replayId);
  const screenshotFile = join(replayDir, "screenshots", "final-state.png");
  const png = await readPng(screenshotFile);
  return png;
};

export const readLocalReplayScreenshot: (
  tempDir: string
) => Promise<PNG> = async (tempDir) => {
  const screenshotFile = join(tempDir, "screenshots", "final-state.png");
  const png = await readPng(screenshotFile);
  return png;
};
