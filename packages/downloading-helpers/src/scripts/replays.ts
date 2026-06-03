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

  // A present record with a missing `signedUrl` otherwise reaches `new URL()`
  // downstream and throws a cryptic `Invalid URL: 'undefined'`. Fail with a
  // diagnosable message naming the artifact instead. For best-effort artifacts
  // the caller's wrapper swallows this; for mandatory ones it surfaces clearly.
  if (!archiveData.signedUrl) {
    throw new Error(
      `Replay artifact "${directoryName}" has no download URL (signedUrl is ${String(
        archiveData.signedUrl,
      )}); the replay record is missing this asset.`,
    );
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
 * - `post-process-including-unmapped-ranges`: Download everything needed for post-process including unmapped ranges.
 * e.g mapped coverage and timeline data.
 */
const DOWNLOAD_SCOPES = [
  "everything",
  "screenshots-only",
  "timeline-only",
  "post-test-run-processing-files-only",
  "post-process-including-unmapped-ranges",
] as const;

export type DownloadScope = (typeof DOWNLOAD_SCOPES)[number];

const DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD: Record<DownloadScope, RegExp> = {
  everything: /.*/,
  "screenshots-only": /^screenshots/,
  "timeline-only": /^timeline/,
  "post-test-run-processing-files-only":
    /^(mappedCoverage|timeline|mappedPerScreenshotJsCoverage)/,
  "post-process-including-unmapped-ranges":
    /^(mappedCoverage|timeline|mappedPerScreenshotJsCoverage|rawCoverage)/,
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

/**
 * The subset of {@link ReplayFileType}s that are downloaded as unzipped archive
 * directories and are therefore eligible for best-effort handling (see
 * {@link ReplayArchiveOptions.bestEffortFileTypes}). Best-effort wrapping is
 * only applied to these artifacts; the other file types (e.g. `timeline`,
 * `logs`, `screenshots`, `diffs`) always fail hard, so they're excluded from
 * this type to make misuse a compile-time error rather than a silent no-op.
 */
export type BestEffortFileType =
  | "snapshottedAssets"
  | "rawPerScreenshotCssCoverage"
  | "rawPerScreenshotJsCoverage"
  | "mappedPerScreenshotJsCoverage";

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

  /**
   * File-type keys whose download is attempted but treated as best-effort: a
   * failure is logged and swallowed instead of failing the whole archive. Use
   * for artifacts that are merely enriching and may legitimately be absent
   * (e.g. `snapshottedAssets` for an old replay whose assets were pruned by an
   * S3 lifecycle policy). Mandatory artifacts must NOT be listed here.
   *
   * Best-effort handling is only wired up for the unzipped-archive artifacts
   * (see {@link BestEffortFileType}); other file types always fail hard, which
   * is why the key type is restricted to that subset.
   *
   * Like `excludeFileTypes`, setting this bypasses the cross-tool cache (the
   * marker is not written), since a swallowed failure may leave the replay
   * directory incomplete.
   */
  bestEffortFileTypes?: ReadonlySet<BestEffortFileType>;
}

export const getOrFetchReplayArchive = async (
  client: MeticulousClient,
  replayId: string,
  downloadScope: DownloadScope = "everything",
  formatJsonFiles: boolean = false,
  options: ReplayArchiveOptions = {},
): Promise<{ fileName: string }> => {
  const logger = initLogger();
  const { excludeFileTypes, bestEffortFileTypes } = options;
  const hasExcludes = excludeFileTypes != null && excludeFileTypes.size > 0;
  const hasBestEffort =
    bestEffortFileTypes != null && bestEffortFileTypes.size > 0;
  // A best-effort artifact may fail and leave the directory incomplete, so —
  // like `excludeFileTypes` — bypass the cache short-circuit and don't write
  // the "fully downloaded" marker.
  const bypassCache = hasExcludes || hasBestEffort;

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
          !bypassCache &&
          (previouslyDownloadedScope === downloadScope ||
            previouslyDownloadedScope === "everything")
        ) {
          logger.debug(`Replay archive already downloaded at ${replayDir}`);
          return { fileName: replayDir };
        } else if (!bypassCache) {
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
        bestEffortFileTypes as ReadonlySet<string> | undefined,
      );
    } else {
      throw new Error(
        `Error: Unknown replay version "${replay.version}". This may be an invalid replay`,
      );
    }

    // Don't write the cache marker when excludes or best-effort file types are
    // set; the cache directory would otherwise look complete to future
    // unfiltered callers even though a swallowed best-effort failure (or an
    // exclusion) may have left it incomplete.
    if (!bypassCache) {
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
  bestEffortFileTypes: ReadonlySet<string> | undefined,
) => {
  const logger = initLogger();
  const downloadUrls = await getReplayV3DownloadUrls(client, replayId);
  if (!downloadUrls) {
    throw new Error(
      "Error: Could not retrieve replay download URLs. This may be an invalid replay",
    );
  }

  const includes = (fileType: string): boolean =>
    shouldDownloadFile(fileType, downloadScope) &&
    !(excludeFileTypes?.has(fileType) ?? false);

  // Wrap a download thunk so that, for file types the caller marked best-effort,
  // a failure (e.g. a 403/404 on a pruned artifact) is logged and swallowed
  // rather than failing the whole archive.
  const maybeBestEffort = (
    fileType: string,
    thunk: () => Promise<unknown>,
  ): (() => Promise<unknown>) =>
    bestEffortFileTypes?.has(fileType)
      ? async () => {
          try {
            await thunk();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            logger.warn(
              `Skipping optional replay artifact "${fileType}" for replay ${replayId}: ${message}`,
            );
          }
        }
      : thunk;

  const {
    screenshots,
    diffs,
    snapshottedAssets,
    rawPerScreenshotCssCoverage,
    rawPerScreenshotJsCoverage,
    mappedPerScreenshotJsCoverage,
    // Pulled out of `rest` so it isn't treated as a flat `S3Location`.
    // `customCheckSnapshots` is a NESTED `Record<type, { file: S3Location }>`
    // (the URL lives at `entry.file.signedUrl`, not at the top level), and the
    // SDK has no consumer that needs it, so we intentionally don't download it
    // here. Leaving it in `rest` would make the loop below call
    // `downloadAndExtractFile(undefined, ...)` -> `new URL(undefined)`.
    customCheckSnapshots,
    ...rest
  } = downloadUrls;

  const logger = initLogger();

  if (
    customCheckSnapshots != null &&
    Object.keys(customCheckSnapshots).length
  ) {
    logger.debug(
      `Replay ${replayId} has ${
        Object.keys(customCheckSnapshots).length
      } customCheckSnapshots; these are not downloaded by this helper.`,
    );
  }

  const filePromises = Object.entries(rest)
    .filter(([fileType]) => includes(fileType))
    // Defensive guard: every key left in `rest` is expected to be a flat
    // `S3Location` with a top-level `signedUrl`. If the backend introduces
    // another grouped/nested top-level key in the future, its entries won't
    // have a `signedUrl`; skip (and log) them rather than passing `undefined`
    // to `new URL` and crashing every replay download.
    .filter(([fileType, data]) => {
      if (data?.signedUrl != null) {
        return true;
      }
      logger.warn(
        `Skipping replay file "${fileType}" for replay ${replayId}: it has no top-level signedUrl. ` +
          `This is likely a new grouped/nested download-urls key the SDK does not yet handle.`,
      );
      return false;
    })
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
    !includes("screenshots") || previouslyDownloadedScope === "screenshots-only"
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
          maybeBestEffort("snapshottedAssets", () =>
            downloadAndUnzipIntoDirectory(
              snapshottedAssets,
              replayDir,
              "snapshotted-assets",
            ),
          ),
        ]
      : []),
    ...(includes("rawPerScreenshotCssCoverage") && rawPerScreenshotCssCoverage
      ? [
          maybeBestEffort("rawPerScreenshotCssCoverage", () =>
            downloadAndUnzipIntoDirectory(
              rawPerScreenshotCssCoverage,
              replayDir,
              "raw-per-screenshot-css-coverage",
            ),
          ),
        ]
      : []),
    ...(includes("rawPerScreenshotJsCoverage") && rawPerScreenshotJsCoverage
      ? [
          maybeBestEffort("rawPerScreenshotJsCoverage", () =>
            downloadAndUnzipIntoDirectory(
              rawPerScreenshotJsCoverage,
              replayDir,
              "raw-per-screenshot-js-coverage",
            ),
          ),
        ]
      : []),
    ...(includes("mappedPerScreenshotJsCoverage") &&
    mappedPerScreenshotJsCoverage
      ? [
          maybeBestEffort("mappedPerScreenshotJsCoverage", () =>
            downloadAndUnzipIntoDirectory(
              mappedPerScreenshotJsCoverage,
              replayDir,
              "mapped-per-screenshot-js-coverage",
            ),
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
