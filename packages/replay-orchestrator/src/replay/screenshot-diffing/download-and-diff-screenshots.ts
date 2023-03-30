import { mkdir, opendir, rm, rmdir } from "fs/promises";
import { join } from "path";
import {
  ScreenshotDiffResult,
  ScreenshotIdentifier,
} from "@alwaysmeticulous/api";
import {
  downloadFile,
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "@alwaysmeticulous/downloading-helpers";
import {
  CompareScreenshotsToTestRun,
  CompareScreenshotsToSpecificReplay,
  ScreenshotComparisonOptions,
} from "@alwaysmeticulous/sdk-bundles-api";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { getBaseScreenshots } from "../../api/test-run.api";
import { ScreenshotLocator } from "../../api/types";
import { diffDownloadedScreenshots } from "./diff-downloaded-screenshots";
import { getScreenshotFiles } from "./get-screenshot-files";
import { logDifferences } from "./log-differences";
import { getScreenshotFilename } from "./utils/get-screenshot-filename";

export interface ComputeAndSaveDiffOptions {
  client: AxiosInstance;
  sessionId: string;
  headReplayId: string;
  headReplayDir: string;
  screenshottingOptions: ScreenshotComparisonOptions;
  logger: log.Logger;
}

export const maybeDownloadAndDiffScreenshots = async ({
  client,
  sessionId,
  headReplayDir,
  headReplayId,
  screenshottingOptions,
  logger,
}: ComputeAndSaveDiffOptions): Promise<
  Record<string, ScreenshotDiffResult[]>
> => {
  if (
    !screenshottingOptions.enabled ||
    screenshottingOptions.compareTo.type === "do-not-compare"
  ) {
    return {};
  }

  if (screenshottingOptions.compareTo.type === "base-screenshots-of-test-run") {
    return diffScreenshotsAgainstTestRun({
      client,
      sessionId,
      headReplayDir,
      headReplayId,
      compareTo: screenshottingOptions.compareTo,
      logger,
    });
  } else if (screenshottingOptions.compareTo.type === "specific-replay") {
    return diffScreenshotsAgainstReplay({
      client,
      headReplayDir,
      headReplayId,
      compareTo: screenshottingOptions.compareTo,
      logger,
    });
  } else {
    return assertNeverCompareTo(screenshottingOptions.compareTo);
  }
};

const diffScreenshotsAgainstTestRun = async ({
  client,
  sessionId,
  headReplayDir,
  headReplayId,
  compareTo,
  logger,
}: Omit<ComputeAndSaveDiffOptions, "screenshottingOptions"> & {
  compareTo: CompareScreenshotsToTestRun;
}): Promise<Record<string, ScreenshotDiffResult[]>> => {
  logger.info(
    `Diffing screenshots against replays of session ${sessionId} in test run ${compareTo.testRunId}`
  );

  const baseScreenshotsDir = join(
    getScreenshotsDir(headReplayDir),
    "base-screenshots"
  );
  await mkdir(baseScreenshotsDir, { recursive: true });
  const baseScreenshots = await getBaseScreenshots({
    client,
    testRunId: compareTo.testRunId,
    sessionId,
  });

  const screenshotIdentifiersByBaseReplayId =
    groupByBaseReplayId(baseScreenshots);
  await downloadScreenshots(baseScreenshots, baseScreenshotsDir);
  logger.debug(
    `Downloaded ${baseScreenshots.length} base screenshots to ${baseScreenshotsDir}}`
  );

  const headReplayScreenshotsDir = getScreenshotsDir(headReplayDir);
  const headReplayScreenshots = await getScreenshotFiles(
    headReplayScreenshotsDir
  );
  const screenshotDiffResultsByBaseReplayId: Record<
    string,
    ScreenshotDiffResult[]
  > = {};

  // Diff the screenshots for each base replay
  for (const baseReplayId of screenshotIdentifiersByBaseReplayId.keys()) {
    const baseScreenshotIdentifiers =
      screenshotIdentifiersByBaseReplayId.get(baseReplayId) ?? [];
    const baseReplayScreenshots = baseScreenshotIdentifiers.map(
      (identifier) => ({
        identifier,
        fileName: getScreenshotFilename(identifier),
      })
    );
    const resultsForBaseReplay = await diffDownloadedScreenshots({
      baseReplayId,
      headReplayId,
      baseScreenshotsDir: baseScreenshotsDir,
      headScreenshotsDir: headReplayScreenshotsDir,
      headReplayScreenshots,
      baseReplayScreenshots,
      diffOptions: compareTo.diffOptions,
    });
    screenshotDiffResultsByBaseReplayId[baseReplayId] = resultsForBaseReplay;
  }

  logDifferences({
    results: Object.values(screenshotDiffResultsByBaseReplayId).flat(),
    diffOptions: compareTo.diffOptions,
    logger,
  });

  // Delete base screenshots directory and all files inside it
  // (we don't want to upload it to the backend)
  await deleteScreenshotsDirectory(baseScreenshotsDir);

  return screenshotDiffResultsByBaseReplayId;
};

const diffScreenshotsAgainstReplay = async ({
  client,
  headReplayDir,
  headReplayId,
  compareTo,
  logger,
}: Omit<ComputeAndSaveDiffOptions, "screenshottingOptions" | "sessionId"> & {
  compareTo: CompareScreenshotsToSpecificReplay;
}): Promise<Record<string, ScreenshotDiffResult[]>> => {
  logger.info(`Diffing screenshots against replay ${compareTo.replayId}`);

  await getOrFetchReplay(client, compareTo.replayId);
  const { fileName: baseReplayFolder } = await getOrFetchReplayArchive(
    client,
    compareTo.replayId
  );
  const baseScreenshotsDir = getScreenshotsDir(baseReplayFolder);
  const baseReplayScreenshots = await getScreenshotFiles(baseScreenshotsDir);

  const headReplayScreenshotsDir = getScreenshotsDir(headReplayDir);
  const headReplayScreenshots = await getScreenshotFiles(
    headReplayScreenshotsDir
  );

  const results = await diffDownloadedScreenshots({
    baseReplayId: compareTo.replayId,
    headReplayId,
    baseScreenshotsDir: baseScreenshotsDir,
    headScreenshotsDir: headReplayScreenshotsDir,
    headReplayScreenshots,
    baseReplayScreenshots,
    diffOptions: compareTo.diffOptions,
  });

  logDifferences({
    results,
    diffOptions: compareTo.diffOptions,
    logger,
  });

  return { [compareTo.replayId]: results };
};

const deleteScreenshotsDirectory = async (directory: string) => {
  const files = await opendir(directory);
  for await (const file of files) {
    if (file.isFile()) {
      await rm(join(directory, file.name));
    } else {
      throw new Error(
        `Expected screenshots directory to only contain screenshot files, but it contained: ${file.name}`
      );
    }
  }
  await rmdir(directory);
};

const groupByBaseReplayId = (screenshots: ScreenshotLocator[]) => {
  const screenshotIdentifiersByBaseReplayId = new Map<
    string,
    ScreenshotIdentifier[]
  >();
  screenshots.forEach(({ replayId, screenshotIdentifier }) => {
    const screenshotIdentifiers =
      screenshotIdentifiersByBaseReplayId.get(replayId) ?? [];
    screenshotIdentifiers.push(screenshotIdentifier);
    screenshotIdentifiersByBaseReplayId.set(replayId, screenshotIdentifiers);
  });
  return screenshotIdentifiersByBaseReplayId;
};

const downloadScreenshots = async (
  screenshots: ScreenshotLocator[],
  directory: string
) => {
  // Download in batches of 20
  const screenshotBatches = chunk(screenshots, 20);
  for (const screenshotBatch of screenshotBatches) {
    const screenshotDownloads = screenshotBatch.map((screenshot) => {
      const filePath = join(
        directory,
        getScreenshotFilename(screenshot.screenshotIdentifier)
      );
      return downloadFile(screenshot.screenshotUrl, filePath);
    });
    await Promise.all(screenshotDownloads);
  }
};

const chunk = <T>(array: T[], size: number) => {
  const chunkedArray = [];
  for (let i = 0; i < array.length; i += size) {
    chunkedArray.push(array.slice(i, i + size));
  }
  return chunkedArray;
};

const getScreenshotsDir = (replayDir: string) => join(replayDir, "screenshots");

const assertNeverCompareTo = (x: never): never => {
  throw new Error("Unexpected comparison type: " + x);
};
