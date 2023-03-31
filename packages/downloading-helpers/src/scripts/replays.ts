import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { getReplay, getReplayDownloadUrl } from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import Zip from "adm-zip";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { downloadFile } from "../file-downloads/download-file";
import {
  fileExists,
  getOrDownloadJsonFile,
  waitToAcquireLockOnDirectory,
} from "../file-downloads/local-data.utils";

export const getOrFetchReplay = async (
  client: AxiosInstance,
  replayId: string
): Promise<{ fileName: string }> => {
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

  return { fileName: replayFile };
};

export const getOrFetchReplayArchive = async (
  client: AxiosInstance,
  replayId: string
): Promise<{ fileName: string }> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayDir = getReplayDir(replayId);
  await mkdir(replayDir, { recursive: true });
  const releaseLock = await waitToAcquireLockOnDirectory(replayDir);

  try {
    const replayArchiveFile = join(replayDir, `${replayId}.zip`);
    const paramsFile = join(replayDir, "metadata.json");

    // Check if "metadata.json" exists. If yes, we assume the replay
    // zip archive has been downloaded and extracted.
    if (await fileExists(paramsFile)) {
      logger.debug(`Replay archive already downloaded at ${replayDir}`);
      return { fileName: replayDir };
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
    return { fileName: replayDir };
  } finally {
    await releaseLock();
  }
};

export const getReplayDir = (replayId: string) =>
  join(getMeticulousLocalDataDir(), "replays", replayId);
