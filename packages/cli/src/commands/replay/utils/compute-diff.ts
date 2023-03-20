import { mkdir } from "fs/promises";
import { basename, join } from "path";
import {
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffResult,
  ScreenshotIdentifier,
} from "@alwaysmeticulous/api";
import { AxiosInstance } from "axios";
import stringify from "fast-json-stable-stringify";
import log from "loglevel";
import { downloadFile } from "../../../api/download";
import { getBaseScreenshots } from "../../../api/test-run.api";
import { ScreenshotLocator } from "../../../api/types";
import {
  getScreenshotFiles,
  getScreenshotsDir,
} from "../../../local-data/replays";
import {
  diffScreenshots,
  logDifferences,
} from "../../screenshot-diff/screenshot-diff.command";
import { getScreenshotIdentifier } from "../../screenshot-diff/utils/get-screenshot-identifier";

export interface ComputeAndSaveDiffOptions {
  client: AxiosInstance;
  baseTestRunId: string;
  sessionId: string;
  headReplayId: string;
  tempDir: string;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
  logger: log.Logger;
}

export const computeDiff = async ({
  client,
  baseTestRunId,
  sessionId,
  tempDir,
  headReplayId,
  screenshottingOptions,
  logger,
}: ComputeAndSaveDiffOptions): Promise<
  Record<string, ScreenshotDiffResult[]>
> => {
  logger.info(
    `Diffing screenshots against replays of session ${sessionId} in test run ${baseTestRunId}`
  );

  const baseScreenshotsDir = join(
    getScreenshotsDir(tempDir),
    "base-screenshots"
  );
  await mkdir(baseScreenshotsDir, { recursive: true });
  const baseScreenshots = await getBaseScreenshots({
    client,
    testRunId: baseTestRunId,
    sessionId,
  });

  const screenshotIdentifiersByBaseReplayId =
    groupByBaseReplayId(baseScreenshots);
  await downloadScreenshots(baseScreenshots, baseScreenshotsDir);
  logger.debug(
    `Downloaded ${baseScreenshots.length} base screenshots to ${baseScreenshotsDir}}`
  );

  const headReplayScreenshotsDir = getScreenshotsDir(tempDir);
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
    const baseReplayScreenshots = await getFilteredScreenshotFiles(
      baseScreenshotsDir,
      baseScreenshotIdentifiers
    );
    const resultsForBaseReplay = await diffScreenshots({
      client,
      baseReplayId,
      headReplayId,
      baseScreenshotsDir: baseScreenshotsDir,
      headScreenshotsDir: headReplayScreenshotsDir,
      headReplayScreenshots,
      baseReplayScreenshots,
      diffOptions: screenshottingOptions.diffOptions,
      logger,
    });
    screenshotDiffResultsByBaseReplayId[baseReplayId] = resultsForBaseReplay;
  }

  logDifferences({
    results: Object.values(screenshotDiffResultsByBaseReplayId).flat(),
    diffOptions: screenshottingOptions.diffOptions,
    logger,
  });

  return screenshotDiffResultsByBaseReplayId;
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
        basename(new URL(screenshot.screenshotUrl).pathname)
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

const getFilteredScreenshotFiles = async (
  screenshotsDirPath: string,
  screenshotIdentifiers: ScreenshotIdentifier[]
): Promise<string[]> => {
  const screenshotFiles = await getScreenshotFiles(screenshotsDirPath);
  const stringifiedScreenshotIdentifiers = new Set(
    screenshotIdentifiers.map(stringify)
  );
  return screenshotFiles.filter((filename) =>
    stringifiedScreenshotIdentifiers.has(
      stringify(getScreenshotIdentifier(filename))
    )
  );
};
