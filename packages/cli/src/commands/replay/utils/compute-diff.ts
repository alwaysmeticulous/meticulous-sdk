import {
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffResult,
  ScreenshotIdentifier,
} from "@alwaysmeticulous/api";
import { AxiosInstance } from "axios";
import stringify from "fast-json-stable-stringify";
import log from "loglevel";
import { getBaseScreenshotLocators } from "../../../api/test-run.api";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  getReplayDir,
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

  const baseScreenshotLocators = await getBaseScreenshotLocators({
    client,
    testRunId: baseTestRunId,
    sessionId,
  });
  const screenshotIdentifiersByBaseReplayId = new Map<
    string,
    ScreenshotIdentifier[]
  >();
  baseScreenshotLocators.forEach(({ replayId, screenshotIdentifier }) => {
    const screenshotIdentifiers =
      screenshotIdentifiersByBaseReplayId.get(replayId) ?? [];
    screenshotIdentifiers.push(screenshotIdentifier);
    screenshotIdentifiersByBaseReplayId.set(replayId, screenshotIdentifiers);
  });

  for (const baseReplayId of screenshotIdentifiersByBaseReplayId.keys()) {
    await getOrFetchReplay(client, baseReplayId);
    await getOrFetchReplayArchive(client, baseReplayId);
  }

  const headReplayScreenshotsDir = getScreenshotsDir(tempDir);
  const headReplayScreenshots = await getScreenshotFiles(
    headReplayScreenshotsDir
  );
  const screenshotDiffResultsByBaseReplayId: Record<
    string,
    ScreenshotDiffResult[]
  > = {};

  for (const baseReplayId of screenshotIdentifiersByBaseReplayId.keys()) {
    const baseReplayScreenshotsDir = getScreenshotsDir(
      getReplayDir(baseReplayId)
    );
    const baseScreenshotIdentifiers =
      screenshotIdentifiersByBaseReplayId.get(baseReplayId) ?? [];
    const baseReplayScreenshots = await getFilteredScreenshotFiles(
      baseReplayScreenshotsDir,
      baseScreenshotIdentifiers
    );
    const resultsForBaseReplay = await diffScreenshots({
      client,
      baseReplayId,
      headReplayId,
      baseScreenshotsDir: baseReplayScreenshotsDir,
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

export const getFilteredScreenshotFiles = async (
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
