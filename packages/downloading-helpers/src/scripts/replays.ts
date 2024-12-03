import { readFileSync, writeFileSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { getReplay, getReplayV3DownloadUrls } from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
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

/**
 * The scope of the download. This is used to determine what to download from the replay.
 * - `everything`: Download everything.
 * - `screenshots-only`: Download only the screenshots.
 * - `post-test-run-processing-files-only`: Download only the files that are needed for post-test-run processing
 * e.g mapped coverage and timeline data.
 */
const DOWNLOAD_SCOPES = [
  "everything",
  "screenshots-only",
  "post-test-run-processing-files-only",
] as const;

export type DownloadScope = (typeof DOWNLOAD_SCOPES)[number];

const DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD: Record<DownloadScope, RegExp> = {
  everything: /.*/,
  "screenshots-only": /^screenshots/,
  "post-test-run-processing-files-only": /^mappedCoverage/,
};

const shouldDownloadFile = (
  fileType: string,
  downloadScope: DownloadScope
): boolean => {
  return DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD[downloadScope].test(fileType);
};

const REPLAY_PREVIOUSLY_DOWNLOADED_FILE_NAME = "previously-downloaded.txt";

export const getOrFetchReplayArchive = async (
  client: AxiosInstance,
  replayId: string,
  downloadScope: DownloadScope = "everything"
): Promise<{ fileName: string }> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const replayDir = getReplayDir(replayId);
  await mkdir(replayDir, { recursive: true });
  const releaseLock = await waitToAcquireLockOnDirectory(replayDir);

  try {
    const previouslyDownloadedFile = join(
      replayDir,
      REPLAY_PREVIOUSLY_DOWNLOADED_FILE_NAME
    );

    // Check what we have already downloaded. This is passed to the downloading function
    // to avoid downloading the same thing twice. This is particularly important because
    // a concurrent process might be using the previously downloaded data, so we don't
    // want to overwrite it while it's being read.
    let previouslyDownloadedScope: DownloadScope | undefined = undefined;
    if (await fileExists(previouslyDownloadedFile)) {
      const fileContents = readFileSync(previouslyDownloadedFile, "utf-8");
      if (DOWNLOAD_SCOPES.includes(fileContents as DownloadScope)) {
        previouslyDownloadedScope = fileContents as DownloadScope;
        if (
          previouslyDownloadedScope === downloadScope ||
          previouslyDownloadedScope === "everything"
        ) {
          logger.debug(`Replay archive already downloaded at ${replayDir}`);
          return { fileName: replayDir };
        } else {
          // Instead of trying to reason about how to combine the two scopes, let's bump
          // to downloading everything which is guaranteed to be a superset.
          logger.debug(
            `Replay archive is partially downloaded at ${replayDir}, will now download everything`
          );
          downloadScope = "everything";
        }
      } else {
        throw new Error(
          `Error: Unknown previously download scope "${fileContents}"`
        );
      }
    }

    const replay = await getReplay(client, replayId);

    if (replay.version === "v3") {
      await downloadReplayV3Files(
        client,
        replayId,
        replayDir,
        downloadScope,
        previouslyDownloadedScope
      );
    } else {
      throw new Error(
        `Error: Unknown replay version "${replay.version}". This may be an invalid replay`
      );
    }

    writeFileSync(previouslyDownloadedFile, downloadScope, "utf-8");
    logger.debug(`Extracted replay archive in ${replayDir}`);
    return { fileName: replayDir };
  } finally {
    await releaseLock();
  }
};

const downloadReplayV3Files = async (
  client: AxiosInstance,
  replayId: string,
  replayDir: string,
  downloadScope: DownloadScope,
  previouslyDownloadedScope: DownloadScope | undefined
) => {
  const downloadUrls = await getReplayV3DownloadUrls(client, replayId);
  if (!downloadUrls) {
    throw new Error(
      "Error: Could not retrieve replay download URLs. This may be an invalid replay"
    );
  }

  const { screenshots, diffs, snapshottedAssets, ...rest } = downloadUrls;

  const filePromises = Object.entries(rest)
    .filter(([fileType]) => shouldDownloadFile(fileType, downloadScope))
    .map(([fileType, data]) => {
      const filePath = join(replayDir, fileType);
      return () => downloadAndExtractFile(data.signedUrl, filePath, replayDir);
    });

  if (shouldDownloadFile("screenshots", downloadScope)) {
    await mkdir(join(replayDir, "screenshots"), { recursive: true });
  }

  const screenshotPromises: (() => Promise<string[] | void>)[] =
    !shouldDownloadFile("screenshots", downloadScope) ||
    previouslyDownloadedScope === "screenshots-only"
      ? []
      : Object.values(screenshots).flatMap((data) => {
          const imageFilePath = join(replayDir, data.image.filePath);
          const metadata = data.metadata;
          if (metadata?.filePath == null) {
            return [() => downloadFile(data.image.signedUrl, imageFilePath)];
          }

          const metadataFilePath = join(replayDir, metadata.filePath);
          return [
            () => downloadFile(data.image.signedUrl, imageFilePath),
            async () => {
              await downloadAndExtractFile(
                metadata.signedUrl,
                metadataFilePath,
                join(replayDir, dirname(metadata.filePath))
              );
            },
          ];
        });

  const diffsFolder = join(replayDir, "diffs");
  await Promise.all(
    Object.keys(diffs ?? {}).map((baseReplayId) =>
      mkdir(join(diffsFolder, baseReplayId), { recursive: true })
    )
  );

  const diffsPromises = shouldDownloadFile("diffs", downloadScope)
    ? Object.values(diffs ?? {}).flatMap((diffsForBase) => {
        return Object.values(diffsForBase).flatMap((urls) => {
          return [
            async () => {
              await downloadFile(
                urls.full.signedUrl,
                join(replayDir, urls.full.filePath)
              );
            },
            async () => {
              await downloadFile(
                urls.thumbnail.signedUrl,
                join(replayDir, urls.thumbnail.filePath)
              );
            },
          ];
        });
      })
    : [];

  const snapshottedAssetsPromises = shouldDownloadFile(
    "snapshottedAssets",
    downloadScope
  )
    ? [
        async () => {
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
        },
      ]
    : [];

  const limited = pLimit(MAX_DOWNLOAD_CONCURRENCY);
  await Promise.all(
    [
      ...filePromises,
      ...screenshotPromises,
      ...diffsPromises,
      ...snapshottedAssetsPromises,
    ].map((p) => limited(p))
  );
};

export const getReplayDir = (replayId: string) =>
  join(getMeticulousLocalDataDir(), "replays", replayId);
