import { mkdir } from "fs/promises";
import { join } from "path";
import type { TestRunData, TestRunDataLocations } from "@alwaysmeticulous/api";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { getTestRunData } from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  initLogger,
} from "@alwaysmeticulous/common";
import { TestRunDataWithheldError } from "../errors";
import { downloadAppContainerLogs } from "./app-container-logs";
import { downloadAndExtractFile } from "./download-file";
import {
  readDownloadedScopes,
  recordDownloadedScope,
} from "./downloaded-scopes.utils";
import {
  sanitizeFilename,
  waitToAcquireLockOnDirectory,
} from "./local-data.utils";

/**
 * Download scope for test run data:
 * - `everything`: Download all available test run data
 * - `app-container-logs`: Download app container logs only
 * - `coverage-only`: Download coverage.json and coverage-stats.json
 * - `coverage-pr-only`: Download coverage.pr.json and coverage-stats.pr.json
 * - `coverageByReplayPrOnly`: Download only coverageByReplayPr
 */
export const DOWNLOAD_SCOPES = [
  "everything",
  "app-container-logs",
  "coverage-by-replay-pr-only",
  "coverage-only",
  "coverage-pr-only",
] as const;

export type TestRunDownloadScope = (typeof DOWNLOAD_SCOPES)[number];

/**
 * Recorded instead of `everything` when the backend withheld the pull-request
 * files from a caller who may not read the project's code, so a later
 * pull-request scope or `everything` still fetches them, or reports them
 * withheld.
 */
const EVERYTHING_EXCEPT_PR = "everything-except-pr";

type RecordedScope = TestRunDownloadScope | typeof EVERYTHING_EXCEPT_PR;

const RECORDED_SCOPES: readonly RecordedScope[] = [
  ...DOWNLOAD_SCOPES,
  EVERYTHING_EXCEPT_PR,
];

const PR_SCOPES: ReadonlySet<RecordedScope> = new Set([
  "coverage-pr-only",
  "coverage-by-replay-pr-only",
]);

/**
 * The `*Pr` fields of `TestRunDataLocations`, which the backend leaves out all
 * together for such a caller.
 */
const PR_FILE_TYPES = [
  "coveragePr",
  "coverageStatsPr",
  "coverageReplaysByFilePr",
  "coverageScreenshotReplaysByFilePr",
  "coverageByReplayPr",
] as const satisfies readonly (keyof TestRunDataLocations)[];

const includesAppContainerLogs = (scope: RecordedScope): boolean =>
  scope === "everything" ||
  scope === EVERYTHING_EXCEPT_PR ||
  scope === "app-container-logs";

const DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD: Record<
  TestRunDownloadScope,
  RegExp
> = {
  everything: /.*/,
  "app-container-logs": /^$/,
  "coverage-by-replay-pr-only": /^coverageByReplayPr/,
  "coverage-only": /^coverage(?:Stats)?$/,
  "coverage-pr-only": /^coverage(?:Stats)?Pr$/,
};

export const shouldDownloadTestRunFile = (
  fileType: string,
  downloadScope: RecordedScope,
): boolean => {
  if (downloadScope === EVERYTHING_EXCEPT_PR) {
    return !(PR_FILE_TYPES as readonly string[]).includes(fileType);
  }
  return DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD[downloadScope].test(fileType);
};

export const getOrFetchTestRunData = async (
  client: MeticulousClient,
  testRunId: string,
  downloadScope: TestRunDownloadScope = "everything",
  /** Only with `testRunId: "latest"`: see `getTestRunData`. */
  project?: string,
): Promise<{ fileName: string; data: TestRunData }> => {
  if (testRunId === "latest") {
    // Download into the resolved run's own directory, so later calls for the
    // same run reuse it.
    const { testRunId: resolvedTestRunId } = await getTestRunData({
      client,
      testRunId,
      project,
    });
    return getOrFetchTestRunData(client, resolvedTestRunId, downloadScope);
  }

  const logger = initLogger();

  const testRunDir = join(
    getMeticulousLocalDataDir(),
    "test-runs",
    sanitizeFilename(testRunId),
  );

  await mkdir(testRunDir, { recursive: true });
  const releaseLock = await waitToAcquireLockOnDirectory(testRunDir);

  try {
    // Only fetch what earlier downloads into this directory did not cover: a
    // concurrent process might be reading those files, so we must not
    // overwrite them.
    const previousScopes = await readDownloadedScopes(
      testRunDir,
      RECORDED_SCOPES,
    );
    const isCovered = (covers: (scope: RecordedScope) => boolean): boolean =>
      previousScopes.some(covers);

    if (isCovered((scope) => coversScope(scope, downloadScope))) {
      logger.debug(`Test run data already downloaded at ${testRunDir}`);
      const testRunData = await getTestRunData({ client, testRunId });
      return { fileName: testRunDir, data: testRunData };
    }

    logger.info("Fetching test run data locations...");
    const testRunData = await getTestRunData({
      client,
      testRunId,
      includeAppContainerLogs:
        includesAppContainerLogs(downloadScope) &&
        !isCovered(includesAppContainerLogs),
    });

    if (!testRunData) {
      logger.error(
        "Error: Could not retrieve test run data. This may be an invalid test run",
      );
      process.exit(1);
    }

    const { testRunId: resolvedTestRunId, ...rest } = testRunData;
    const locations: TestRunDataLocations = rest;
    const prFilesWithheld = PR_FILE_TYPES.every(
      (fileType) => locations[fileType] == null,
    );
    if (prFilesWithheld && PR_SCOPES.has(downloadScope)) {
      throw new TestRunDataWithheldError(resolvedTestRunId, downloadScope);
    }

    logger.info("Downloading test run data...");
    const downloadPromises = Object.entries(locations)
      .filter(
        ([fileType]) =>
          shouldDownloadTestRunFile(fileType, downloadScope) &&
          !isCovered((scope) => shouldDownloadTestRunFile(fileType, scope)),
      )
      .map(([fileType, location]) => {
        if (location == null) {
          return null;
        }
        const url = location.signedUrl;
        const filePath = location.filePath;
        if (typeof url !== "string" || typeof filePath !== "string") {
          return null;
        }
        const targetFilePath = join(testRunDir, filePath);

        return async () => {
          logger.info(`Downloading and extracting ${fileType}...`);
          await downloadAndExtractFile(
            location.signedUrl,
            targetFilePath,
            testRunDir,
          );
        };
      })
      .filter((promise): promise is () => Promise<void> => promise !== null);

    await Promise.all(downloadPromises.map((fn) => fn()));

    if (testRunData.appContainerLogs != null) {
      logger.info("Downloading app container logs...");
      await downloadAppContainerLogs(testRunData.appContainerLogs, testRunDir);
    }

    await recordDownloadedScope(
      testRunDir,
      previousScopes,
      prFilesWithheld && downloadScope === "everything"
        ? EVERYTHING_EXCEPT_PR
        : downloadScope,
    );
    logger.info("Test run data downloaded.");

    return { fileName: testRunDir, data: testRunData };
  } finally {
    await releaseLock();
  }
};

const coversScope = (
  recorded: RecordedScope,
  requested: TestRunDownloadScope,
): boolean => {
  if (recorded === requested || recorded === "everything") {
    return true;
  }
  return (
    recorded === EVERYTHING_EXCEPT_PR &&
    requested !== "everything" &&
    !PR_SCOPES.has(requested)
  );
};
