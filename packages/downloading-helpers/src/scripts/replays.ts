import { mkdir, rm } from "fs/promises";
import { dirname, join } from "path";
import {
  getReplay,
  getReplayDownloadUrl,
  getReplayV3DownloadUrls,
} from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import extract from "extract-zip";
import log from "loglevel";
import pLimit from "p-limit";
import {
  downloadAndExtractFile,
  downloadFile,
} from "../file-downloads/download-file";
import {
  fileExists,
  getOrDownloadJsonFile,
  waitToAcquireLockOnDirectory,
} from "../file-downloads/local-data.utils";

const MAX_DOWNLOAD_CONCURRENCY = 20;

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
    const paramsFile = join(replayDir, "metadata.json");

    // Check if "metadata.json" exists. If yes, we assume the replay
    // zip archive has been downloaded and extracted.
    if (await fileExists(paramsFile)) {
      logger.debug(`Replay archive already downloaded at ${replayDir}`);
      return { fileName: replayDir };
    }

    const replay = await getReplay(client, replayId);

    if (["v1", "v2"].includes(replay.version)) {
      await downloadReplayV2Archive(client, replayId, replayDir);
    } else if (replay.version === "v3") {
      await downloadReplayV3Files(client, replayId, replayDir);
    } else {
      throw new Error(
        `Error: Unknown replay version "${replay.version}". This may be an invalid replay`
      );
    }

    logger.debug(`Extracted replay archive in ${replayDir}`);
    return { fileName: replayDir };
  } finally {
    await releaseLock();
  }
};

const downloadReplayV2Archive = async (
  client: AxiosInstance,
  replayId: string,
  replayDir: string
) => {
  const replayArchiveFile = join(replayDir, `${replayId}.zip`);

  const downloadUrlData = await getReplayDownloadUrl(client, replayId);
  if (!downloadUrlData) {
    throw new Error(
      "Error: Could not retrieve replay archive URL. This may be an invalid replay"
    );
  }

  await downloadFile(downloadUrlData.dowloadUrl, replayArchiveFile);

  await extract(replayArchiveFile, { dir: replayDir });
  await rm(replayArchiveFile);
};

const downloadReplayV3Files = async (
  client: AxiosInstance,
  replayId: string,
  replayDir: string
) => {
  const downloadUrls = await getReplayV3DownloadUrls(client, replayId);
  if (!downloadUrls) {
    throw new Error(
      "Error: Could not retrieve replay download URLs. This may be an invalid replay"
    );
  }

  const { screenshots, snapshottedAssets, ...rest } = downloadUrls;

  await mkdir(join(replayDir, "screenshots"), { recursive: true });

  const filePromises = Object.entries(rest).map(([fileName, data]) => {
    const filePath = join(replayDir, fileName);
    return () => downloadAndExtractFile(data.signedUrl, filePath, replayDir);
  });

  const screenshotPromises = Object.values(screenshots).flatMap((data) => {
    const imageFilePath = join(replayDir, data.image.filePath);
    const metadataFilePath = join(replayDir, data.metadata.filePath);

    return [
      () => downloadFile(data.image.signedUrl, imageFilePath),
      () =>
        downloadAndExtractFile(
          data.metadata.signedUrl,
          metadataFilePath,
          join(replayDir, dirname(data.metadata.filePath))
        ),
    ];
  });

  const snapshottedAssetsPromise = async () => {
    if (!snapshottedAssets) {
      return;
    }

    const snapshottedAssetsDir = join(replayDir, "snapshotted-assets");
    await mkdir(snapshottedAssetsDir, {
      recursive: true,
    });
    await downloadAndExtractFile(
      snapshottedAssets.signedUrl,
      join(replayDir, snapshottedAssets.filePath),
      snapshottedAssetsDir
    );
  };

  const limited = pLimit(MAX_DOWNLOAD_CONCURRENCY);
  await Promise.all(
    [...filePromises, ...screenshotPromises, snapshottedAssetsPromise].map(
      (p) => limited(p)
    )
  );
};

export const getReplayDir = (replayId: string) =>
  join(getMeticulousLocalDataDir(), "replays", replayId);
