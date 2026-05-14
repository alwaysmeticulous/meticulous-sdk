import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import {
  getReplay,
  getReplayV3DownloadUrls,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  initLogger,
} from "@alwaysmeticulous/common";
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

const downloadAndUnzipIntoDirectory = async (
  archiveData: { signedUrl: string; filePath: string } | null | undefined,
  replayDir: string,
  directoryName: string,
): Promise<void> => {
  if (!archiveData) {
    return;
  }

  const targetDir = join(replayDir, directoryName);
  await mkdir(targetDir, { recursive: true });
  await downloadAndExtractFile(
    archiveData.signedUrl,
    join(replayDir, archiveData.filePath),
    targetDir,
  );
};

export const getOrFetchReplay = async (
  client: MeticulousClient,
  replayId: string,
): Promise<{ fileName: string }> => {
  const logger = initLogger();

  const replayFile = join(getReplayDir(replayId), `${replayId}.json`);

  const replay = await getOrDownloadJsonFile({
    filePath: replayFile,
    dataDescription: "replay",
    downloadJson: () => getReplay(client, replayId),
  });

  if (!replay) {
    logger.error(
      `Error: Could not retrieve replay with id "${replayId}". Is the API token correct?`,
    );
    process.exit(1);
  }

  return { fileName: replayFile };
};

/**
 * The scope of the download. This is used to determine what to download from the replay.
 * - `everything`: Download everything.
 * - `screenshots-only`: Download only the screenshots.
 * - `timeline-only`: Download only the timeline data.
 * - `post-test-run-processing-files-only`: Download only the files that are needed for post-test-run processing
 * e.g mapped coverage and timeline data.
 */
const DOWNLOAD_SCOPES = [
  "everything",
  "screenshots-only",
  "timeline-only",
  "post-test-run-processing-files-only",
] as const;

export type DownloadScope = (typeof DOWNLOAD_SCOPES)[number];

const DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD: Record<DownloadScope, RegExp> = {
  everything: /.*/,
  "screenshots-only": /^screenshots/,
  "timeline-only": /^timeline/,
  "post-test-run-processing-files-only":
    /^(mappedCoverage|timeline|mappedPerScreenshotJsCoverage)/,
};

const shouldDownloadFile = (
  fileType: string,
  downloadScope: DownloadScope,
): boolean => {
  return DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD[downloadScope].test(fileType);
};

const REPLAY_PREVIOUSLY_DOWNLOADED_FILE_NAME = "previously-downloaded.txt";

/**
 * Known file-type keys returned by the v3 download-urls endpoint. The server
 * is the source of truth and may include additional keys; this union covers
 * the ones the SDK references explicitly plus the common excludable
 * artifacts. Used to give callers compile-time safety on `excludeFileTypes`
 * so a typo (e.g. `playbackdata`) is caught at the type level rather than
 * silently failing at runtime.
 */
export type ReplayFileType =
  | "screenshots"
  | "diffs"
  | "snapshottedAssets"
  | "rawCoverage"
  | "rawPerScreenshotCssCoverage"
  | "rawPerScreenshotJsCoverage"
  | "mappedCoverage"
  | "mappedPerScreenshotJsCoverage"
  | "playbackData"
  | "timeline"
  | "metadata"
  | "accuracy"
  | "stackTraces"
  | "cookies"
  | "launchBrowserAndReplayParams"
  | "logs";

export interface ReplayArchiveOptions {
  /**
   * File-type keys to skip during download (e.g. `playbackData`, `rawCoverage`,
   * `diffs`). Useful when the caller knows it will not need certain artifacts
   * and wants to avoid the bandwidth/time cost of fetching them.
   *
   * When set, the cross-tool replay cache is bypassed: the cache short-circuit
   * is skipped and the `previously-downloaded.txt` marker is not written, so
   * subsequent unfiltered callers will re-download into the cache.
   */
  excludeFileTypes?: ReadonlySet<ReplayFileType>;
}

export const getOrFetchReplayArchive = async (
  client: MeticulousClient,
  replayId: string,
  downloadScope: DownloadScope = "everything",
  formatJsonFiles: boolean = false,
  options: ReplayArchiveOptions = {},
): Promise<{ fileName: string }> => {
  const logger = initLogger();
  const { excludeFileTypes } = options;
  const hasExcludes = excludeFileTypes != null && excludeFileTypes.size > 0;

  const replayDir = getReplayDir(replayId);
  await mkdir(replayDir, { recursive: true });
  const releaseLock = await waitToAcquireLockOnDirectory(replayDir);

  try {
    const previouslyDownloadedFile = join(
      replayDir,
      REPLAY_PREVIOUSLY_DOWNLOADED_FILE_NAME,
    );

    // Check what we have already downloaded. This is passed to the downloading function
    // to avoid downloading the same thing twice. This is particularly important because
    // a concurrent process might be using the previously downloaded data, so we don't
    // want to overwrite it while it's being read.
    //
    // When `excludeFileTypes` is set we skip the cache short-circuit so that callers
    // always get a fresh fetch with the requested exclusions applied.
    let previouslyDownloadedScope: DownloadScope | undefined = undefined;
    if (await fileExists(previouslyDownloadedFile)) {
      const fileContents = (
        await readFile(previouslyDownloadedFile, "utf-8")
      ).trim();
      if (DOWNLOAD_SCOPES.includes(fileContents as DownloadScope)) {
        previouslyDownloadedScope = fileContents as DownloadScope;
        if (
          !hasExcludes &&
          (previouslyDownloadedScope === downloadScope ||
            previouslyDownloadedScope === "everything")
        ) {
          logger.debug(`Replay archive already downloaded at ${replayDir}`);
          return { fileName: replayDir };
        } else if (!hasExcludes) {
          // Instead of trying to reason about how to combine the two scopes, let's bump
          // to downloading everything which is guaranteed to be a superset.
          logger.debug(
            `Replay archive is partially downloaded at ${replayDir}, will now download everything`,
          );
          downloadScope = "everything";
        }
      } else {
        throw new Error(
          `Error: Unknown previously download scope "${fileContents}"`,
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
        formatJsonFiles,
        previouslyDownloadedScope,
        // Widen to `ReadonlySet<string>` at the boundary: `ReplayFileType` is
        // for caller-side typo safety, but internally we check against
        // arbitrary keys returned by the server.
        excludeFileTypes as ReadonlySet<string> | undefined,
      );
    } else {
      throw new Error(
        `Error: Unknown replay version "${replay.version}". This may be an invalid replay`,
      );
    }

    // Don't write the cache marker when excludes are set; the cache directory
    // would otherwise look complete to future unfiltered callers.
    if (!hasExcludes) {
      await writeFile(previouslyDownloadedFile, downloadScope, "utf-8");
    }
    logger.debug(`Extracted replay archive in ${replayDir}`);
    return { fileName: replayDir };
  } finally {
    await releaseLock();
  }
};

const downloadReplayV3Files = async (
  client: MeticulousClient,
  replayId: string,
  replayDir: string,
  downloadScope: DownloadScope,
  formatJsonFiles: boolean,
  previouslyDownloadedScope: DownloadScope | undefined,
  excludeFileTypes: ReadonlySet<string> | undefined,
) => {
  const downloadUrls = await getReplayV3DownloadUrls(client, replayId);
  if (!downloadUrls) {
    throw new Error(
      "Error: Could not retrieve replay download URLs. This may be an invalid replay",
    );
  }

  const includes = (fileType: string): boolean =>
    shouldDownloadFile(fileType, downloadScope) &&
    !(excludeFileTypes?.has(fileType) ?? false);

  const {
    screenshots,
    diffs,
    snapshottedAssets,
    rawPerScreenshotCssCoverage,
    rawPerScreenshotJsCoverage,
    mappedPerScreenshotJsCoverage,
    ...rest
  } = downloadUrls;

  const filePromises = Object.entries(rest)
    .filter(([fileType]) => includes(fileType))
    .map(([fileType, data]) => {
      const filePath = join(replayDir, fileType);
      return async () => {
        await downloadAndExtractFile(data.signedUrl, filePath, replayDir);
        if (formatJsonFiles && filePath.endsWith(".json")) {
          const fileContents = await readFile(filePath, "utf-8");
          const json = JSON.parse(fileContents);
          await writeFile(filePath, JSON.stringify(json, null, 2), "utf-8");
        }
      };
    });

  if (includes("screenshots")) {
    await mkdir(join(replayDir, "screenshots"), { recursive: true });
  }

  // If `previouslyDownloadedScope === "screenshots-only"` we trust that the
  // screenshots are already on disk from a prior unfiltered download (the
  // marker is only ever written after an unfiltered run) and skip re-download.
  // Safe even when `excludeFileTypes` is set: we're leaving existing files in
  // place, not re-using stale data.
  const screenshotPromises: (() => Promise<string[] | void>)[] =
    !includes("screenshots") ||
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
                join(replayDir, dirname(metadata.filePath)),
              );
            },
          ];
        });

  const diffsFolder = join(replayDir, "diffs");
  if (includes("diffs")) {
    await Promise.all(
      Object.keys(diffs ?? {}).map((baseReplayId) =>
        mkdir(join(diffsFolder, baseReplayId), { recursive: true }),
      ),
    );
  }

  const diffsPromises = includes("diffs")
    ? Object.values(diffs ?? {}).flatMap((diffsForBase) => {
        return Object.values(diffsForBase).flatMap((urls) => {
          return [
            async () => {
              await downloadFile(
                urls.full.signedUrl,
                join(replayDir, urls.full.filePath),
              );
            },
            async () => {
              await downloadFile(
                urls.thumbnail.signedUrl,
                join(replayDir, urls.thumbnail.filePath),
              );
            },
          ];
        });
      })
    : [];

  const archivePromises = [
    ...(includes("snapshottedAssets")
      ? [
          () =>
            downloadAndUnzipIntoDirectory(
              snapshottedAssets,
              replayDir,
              "snapshotted-assets",
            ),
        ]
      : []),
    ...(includes("rawPerScreenshotCssCoverage") && rawPerScreenshotCssCoverage
      ? [
          () =>
            downloadAndUnzipIntoDirectory(
              rawPerScreenshotCssCoverage,
              replayDir,
              "raw-per-screenshot-css-coverage",
            ),
        ]
      : []),
    ...(includes("rawPerScreenshotJsCoverage") && rawPerScreenshotJsCoverage
      ? [
          () =>
            downloadAndUnzipIntoDirectory(
              rawPerScreenshotJsCoverage,
              replayDir,
              "raw-per-screenshot-js-coverage",
            ),
        ]
      : []),
    ...(includes("mappedPerScreenshotJsCoverage") &&
    mappedPerScreenshotJsCoverage
      ? [
          () =>
            downloadAndUnzipIntoDirectory(
              mappedPerScreenshotJsCoverage,
              replayDir,
              "mapped-per-screenshot-js-coverage",
            ),
        ]
      : []),
  ];

  const limited = pLimit(MAX_DOWNLOAD_CONCURRENCY);
  await Promise.all(
    [
      ...filePromises,
      ...screenshotPromises,
      ...diffsPromises,
      ...archivePromises,
    ].map((p) => limited(p)),
  );
};

export const getReplayDir = (replayId: string) =>
  join(getMeticulousLocalDataDir(), "replays", replayId);
