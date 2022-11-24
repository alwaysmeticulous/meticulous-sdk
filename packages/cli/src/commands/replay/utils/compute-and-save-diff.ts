import {
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { createReplayDiff } from "../../../api/replay-diff.api";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  getReplayDir,
  getScreenshotsDir,
} from "../../../local-data/replays";
import {
  checkScreenshotDiffResult,
  diffScreenshots,
  ScreenshotDiffError,
} from "../../screenshot-diff/screenshot-diff.command";

export interface ComputeAndSaveDiffOptions {
  client: AxiosInstance;
  testRunId: string | null;
  baseReplayId: string;
  headReplayId: string;
  tempDir: string;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
}

export const computeAndSaveDiff = async ({
  client,
  baseReplayId,
  tempDir,
  headReplayId,
  screenshottingOptions,
  testRunId,
}: ComputeAndSaveDiffOptions): Promise<{
  screenshotDiffResults: ScreenshotDiffResult[];
  screenshotDiffError: ScreenshotDiffError | null;
}> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

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
  });

  const replayDiff = await createReplayDiff({
    client,
    headReplayId,
    baseReplayId,
    testRunId,
    data: {
      screenshotAssertionsOptions: screenshottingOptions,
      screenshotDiffResults,
    },
  });

  logger.debug(replayDiff);

  const screenshotDiffError = checkScreenshotDiffResult({
    baseReplayId,
    headReplayId,
    results: screenshotDiffResults,
    diffOptions: screenshottingOptions.diffOptions,
  });

  return { screenshotDiffResults, screenshotDiffError };
};
