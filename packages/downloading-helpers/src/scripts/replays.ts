import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { getReplay, getReplayV3DownloadUrls } from "@alwaysmeticulous/client";
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
  readDownloadedScopes,
  recordDownloadedScope,
} from "../file-downloads/downloaded-scopes.utils";
import {
  getOrDownloadJsonFile,
  waitToAcquireLockOnDirectory,
} from "../file-downloads/local-data.utils";
import { ReplayHasNoArtifactsError } from "../errors";

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
 * - `post-process-including-css-coverage`: Same as post-test-run-processing-files-only, plus the
 *   replay's raw JS coverage, the replay's mapped CSS coverage and — for replays that did not map their own — the raw CSS
 *   coverage, whose baked-in stylesheet text — where the artifact still carries any — is all
 *   post-processing can map from. Deliberately excludes snapshotted assets: a coverage entry
 *   whose text could not be read is dropped before it can carry ranges, so the snapshotted
 *   stylesheet body is never the source; and a replay whose stylesheet source maps were
 *   snapshotted also mapped its own CSS on the pod, which short-circuits the fallback before
 *   it looks for a map.
 */
const DOWNLOAD_SCOPES = [
  "everything",
  "screenshots-only",
  "timeline-only",
  "post-test-run-processing-files-only",
  "post-process-including-css-coverage",
] as const;

export type DownloadScope = (typeof DOWNLOAD_SCOPES)[number];

const DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD: Record<DownloadScope, RegExp> = {
  everything: /.*/,
  "screenshots-only": /^screenshots/,
  "timeline-only": /^timeline/,
  "post-test-run-processing-files-only":
    /^(mappedCoverage|timeline|mappedPerScreenshotJsCoverage)/,
  "post-process-including-css-coverage":
    /^(mappedCoverage|timeline|mappedPerScreenshotJsCoverage|rawCoverage|cssCoverage|mappedCssCoverage)/,
};

const shouldDownloadFile = (
  fileType: string,
  downloadScope: DownloadScope,
): boolean => {
  return DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD[downloadScope].test(fileType);
};

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
  | "cssCoverage"
  | "mappedCssCoverage"
  | "playbackData"
  | "timeline"
  | "metadata"
  | "accuracy"
  | "stackTraces"
  | "cookies"
  | "launchBrowserAndReplayParams"
  | "logs"
  | "appContainerLogs"
  | "chromeDiagnostics";

/**
 * The subset of {@link ReplayFileType}s that are downloaded as unzipped archive
 * directories and are therefore eligible for best-effort handling (see
 * {@link ReplayArchiveOptions.bestEffortFileTypes}). Best-effort wrapping is
 * only applied to these artifacts; the other file types (e.g. `timeline`,
 * `logs`, `screenshots`, `diffs`) always fail hard, so they're excluded from
 * this type to make misuse a compile-time error rather than a silent no-op.
 */
export type BestEffortFileType =
  | "chromeDiagnostics"
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
   * A directory an earlier download already completed for this scope (or
   * `everything`) is returned as is, so it may still hold excluded files.
   * Otherwise the excluded files are skipped, and the scope is not recorded as
   * downloaded, so later unfiltered callers still fetch them.
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
   * Like `excludeFileTypes`, setting this keeps the scope from being recorded
   * as downloaded, since a swallowed failure may leave the replay directory
   * incomplete. A directory an earlier download already completed is still
   * returned as is: that download fetched these files as mandatory, so any it
   * lacks were not available.
   */
  bestEffortFileTypes?: ReadonlySet<BestEffortFileType>;
}

export const getOrFetchReplayArchive = async (
  client: MeticulousClient,
  replayId: string,
  downloadScope: DownloadScope = "everything",
  options: ReplayArchiveOptions = {},
): Promise<{ fileName: string }> => {
  const logger = initLogger();
  const { excludeFileTypes, bestEffortFileTypes } = options;
  const hasExcludes = excludeFileTypes != null && excludeFileTypes.size > 0;
  const hasBestEffort =
    bestEffortFileTypes != null && bestEffortFileTypes.size > 0;
  // A best-effort artifact may fail and leave the directory incomplete, so —
  // like `excludeFileTypes` — don't record the scope as downloaded.
  const bypassCache = hasExcludes || hasBestEffort;
  // Widen to `ReadonlySet<string>`: `ReplayFileType` is for caller-side typo
  // safety, but internally we check against arbitrary keys returned by the
  // server.
  const excluded: ReadonlySet<string> = excludeFileTypes ?? new Set();

  const replayDir = getReplayDir(replayId);
  await mkdir(replayDir, { recursive: true });
  const releaseLock = await waitToAcquireLockOnDirectory(replayDir);

  try {
    // Only fetch what earlier downloads into this directory did not cover: a
    // concurrent process might be reading those files, so we must not
    // overwrite them.
    const previousScopes = await readDownloadedScopes(
      replayDir,
      DOWNLOAD_SCOPES,
    );
    if (
      previousScopes.includes(downloadScope) ||
      previousScopes.includes("everything")
    ) {
      logger.debug(`Replay archive already downloaded at ${replayDir}`);
      return { fileName: replayDir };
    }
    const includes = (fileType: string): boolean =>
      shouldDownloadFile(fileType, downloadScope) &&
      !excluded.has(fileType) &&
      !previousScopes.some((scope) => shouldDownloadFile(fileType, scope));

    const replay = await getReplay(client, replayId);

    let hasNormalArtifacts = false;
    if (replay.version === "v3") {
      hasNormalArtifacts = await downloadReplayV3Files(
        client,
        replayId,
        replayDir,
        includes,
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
    if (!bypassCache && hasNormalArtifacts) {
      await recordDownloadedScope(replayDir, previousScopes, downloadScope);
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
  includes: (fileType: string) => boolean,
  bestEffortFileTypes: ReadonlySet<string> | undefined,
) => {
  const logger = initLogger();

  const downloadUrls = await getReplayV3DownloadUrls(client, replayId, {
    // Avoid requesting presigned URLs for sections this download won't use.
    // Screenshots and diffs can each have hundreds of entries, making the
    // response payload large; skipping them keeps the request lightweight.
    includeScreenshots: includes("screenshots"),
    includeDiffs: includes("diffs"),
    // Costs the server an S3 existence check, so only ask when this download
    // would actually keep the file.
    includeAppContainerLogs: includes("appContainerLogs"),
    includeChromeDiagnostics: includes("chromeDiagnostics"),
  });
  if (!downloadUrls) {
    throw new ReplayHasNoArtifactsError(replayId);
  }

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
    chromeDiagnostics,
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
    // Pulled out of `rest` because it is plain NDJSON, not one of the
    // gzipped/zipped artifacts the `rest` loop feeds to
    // `downloadAndExtractFile`, and because it is optional (see below).
    appContainerLogs,
    ...rest
  } = downloadUrls;

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
      };
    });

  if (includes("screenshots")) {
    await mkdir(join(replayDir, "screenshots"), { recursive: true });
  }

  const screenshotPromises: (() => Promise<string[] | void>)[] = !includes(
    "screenshots",
  )
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
    ...(includes("chromeDiagnostics") && chromeDiagnostics
      ? [
          maybeBestEffort("chromeDiagnostics", () =>
            downloadAndUnzipIntoDirectory(
              chromeDiagnostics,
              replayDir,
              "chrome",
            ),
          ),
        ]
      : []),
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

  // Absent for most replays, which is why the key is optional rather than this
  // download being best-effort: the server omits it unless the object exists, so
  // there is nothing to attempt. Once it is offered it is as reliable as any
  // other artifact here — same bucket, same lifecycle — so a failure is fatal,
  // like `timeline` or `metadata`.
  const appContainerLogsPromises =
    includes("appContainerLogs") && appContainerLogs
      ? [
          () =>
            downloadFile(
              appContainerLogs.signedUrl,
              join(replayDir, appContainerLogs.filePath),
            ),
        ]
      : [];

  const limited = pLimit(MAX_DOWNLOAD_CONCURRENCY);
  await Promise.all(
    [
      ...filePromises,
      ...screenshotPromises,
      ...diffsPromises,
      ...archivePromises,
      ...appContainerLogsPromises,
    ].map((p) => limited(p)),
  );
  // Diagnostics-only downloads must not satisfy later normal-artifact requests.
  return !chromeDiagnostics || downloadUrls.metadata != null;
};

export const getReplayDir = (replayId: string) =>
  join(getMeticulousLocalDataDir(), "replays", replayId);
