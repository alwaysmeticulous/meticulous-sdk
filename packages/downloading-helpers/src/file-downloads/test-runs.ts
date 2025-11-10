import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { TestRunDataLocations } from "@alwaysmeticulous/api";
import { getTestRunData, MeticulousClient } from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  initLogger,
} from "@alwaysmeticulous/common";
import { downloadAndExtractFile } from "./download-file";
import {
  fileExists,
  sanitizeFilename,
  waitToAcquireLockOnDirectory,
} from "./local-data.utils";

/**
 * Download scope for test run data:
 * - `everything`: Download all available test run data
 * - `coverageByReplayPrOnly`: Download only coverageByReplayPr
 */
export const DOWNLOAD_SCOPES = [
  "everything",
  "coverage-by-replay-pr-only",
  "coverage-only",
] as const;

export type TestRunDownloadScope = (typeof DOWNLOAD_SCOPES)[number];

const DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD: Record<
  TestRunDownloadScope,
  RegExp
> = {
  everything: /.*/,
  "coverage-by-replay-pr-only": /^coverageByReplayPr/,
  "coverage-only": /^coverage$/,
};

const shouldDownloadFile = (
  fileType: string,
  downloadScope: TestRunDownloadScope,
): boolean => {
  return DOWNLOAD_SCOPE_TO_FILES_TO_DOWNLOAD[downloadScope].test(fileType);
};

const TEST_RUN_PREVIOUSLY_DOWNLOADED_FILE_NAME = "previously-downloaded.txt";

export const getOrFetchTestRunData = async (
  client: MeticulousClient,
  testRunId: string,
  downloadScope: TestRunDownloadScope = "everything",
): Promise<{ fileName: string; data: TestRunDataLocations }> => {
  const logger = initLogger();

  const testRunDir = join(
    getMeticulousLocalDataDir(),
    "test-runs",
    testRunId === "latest"
      ? `latest_${Date.now()}`
      : sanitizeFilename(testRunId),
  );

  await mkdir(testRunDir, { recursive: true });
  const releaseLock = await waitToAcquireLockOnDirectory(testRunDir);

  try {
    const previouslyDownloadedFile = join(
      testRunDir,
      TEST_RUN_PREVIOUSLY_DOWNLOADED_FILE_NAME,
    );

    // Check what we have already downloaded. This is passed to the downloading function
    // to avoid downloading the same thing twice. This is particularly important because
    // a concurrent process might be using the previously downloaded data, so we don't
    // want to overwrite it while it's being read.
    let previouslyDownloadedScope: TestRunDownloadScope | undefined = undefined;
    if (await fileExists(previouslyDownloadedFile)) {
      const fileContents = await readFile(previouslyDownloadedFile, "utf-8");
      if (DOWNLOAD_SCOPES.includes(fileContents as TestRunDownloadScope)) {
        previouslyDownloadedScope = fileContents as TestRunDownloadScope;
        if (
          previouslyDownloadedScope === downloadScope ||
          previouslyDownloadedScope === "everything"
        ) {
          logger.debug(`Test run data already downloaded at ${testRunDir}`);
          const testRunData = await getTestRunData({ client, testRunId });
          return { fileName: testRunDir, data: testRunData };
        } else {
          // Instead of trying to reason about how to combine the two scopes, let's bump
          // to downloading everything which is guaranteed to be a superset.
          logger.debug(
            `Test run data is partially downloaded at ${testRunDir}, will now download everything`,
          );
          downloadScope = "everything";
        }
      } else {
        throw new Error(
          `Error: Unknown previously download scope "${fileContents}"`,
        );
      }
    }

    logger.info("Fetching test run data locations...");
    const testRunData = await getTestRunData({ client, testRunId });

    if (!testRunData) {
      logger.error(
        "Error: Could not retrieve test run data. This may be an invalid test run",
      );
      process.exit(1);
    }

    logger.info("Downloading test run data...");
    const downloadPromises = Object.entries(testRunData)
      .filter(([fileType]) => shouldDownloadFile(fileType, downloadScope))
      .map(([fileType, location]) => {
        if (location == null) {
          return null;
        }
        const url = location.signedUrl;
        const filePath = location.filePath;
        if (typeof url !== "string" || typeof filePath !== "string") {
          return null;
        }

        return async () => {
          logger.info(`Downloading and extracting ${fileType}...`);
          await downloadAndExtractFile(
            location.signedUrl,
            filePath,
            testRunDir,
          );
          if (filePath.endsWith(".json")) {
            const fileContents = await readFile(filePath, "utf-8");
            const json = JSON.parse(fileContents);
            await writeFile(filePath, JSON.stringify(json, null, 2), "utf-8");
          }
        };
      })
      .filter((promise): promise is () => Promise<void> => promise !== null);

    await Promise.all(downloadPromises.map((fn) => fn()));

    await writeFile(previouslyDownloadedFile, downloadScope, "utf-8");
    logger.info("Test run data downloaded.");

    return { fileName: testRunDir, data: testRunData };
  } finally {
    await releaseLock();
  }
};
