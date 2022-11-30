import {
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  getReplayDir,
  getScreenshotsDir,
} from "../../../local-data/replays";
import {
  diffScreenshots,
  ScreenshotDiffsSummary,
  summarizeDifferences,
} from "../../screenshot-diff/screenshot-diff.command";

export interface ComputeAndSaveDiffOptions {
  client: AxiosInstance;
  baseReplayId: string;
  headReplayId: string;
  tempDir: string;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
  logger: log.Logger;
}

export const computeDiff = async ({
  client,
  baseReplayId,
  tempDir,
  headReplayId,
  screenshottingOptions,
  logger,
}: ComputeAndSaveDiffOptions): Promise<{
  screenshotDiffResults: ScreenshotDiffResult[];
  screenshotDiffsSummary: ScreenshotDiffsSummary;
}> => {
  logger.info(`Diffing screenshots against replay ${baseReplayId}`);

  await getOrFetchReplay(client, baseReplayId);
  await getOrFetchReplayArchive(client, baseReplayId);

  const baseReplayScreenshotsDir = getScreenshotsDir(
    getReplayDir(baseReplayId)
  );
  const headReplayScreenshotsDir = getScreenshotsDir(tempDir);

  const screenshotDiffResults = await diffScreenshots({
    client,
    baseReplayId,
    headReplayId,
    baseScreenshotsDir: baseReplayScreenshotsDir,
    headScreenshotsDir: headReplayScreenshotsDir,
    diffOptions: screenshottingOptions.diffOptions,
    logger,
  });

  const screenshotDiffsSummary = summarizeDifferences({
    baseReplayId,
    headReplayId,
    results: screenshotDiffResults,
    diffOptions: screenshottingOptions.diffOptions,
    logger,
  });

  return { screenshotDiffResults, screenshotDiffsSummary };
};
