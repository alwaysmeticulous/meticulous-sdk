import { basename, join } from "path";
import {
  ScreenshotDiffOptions,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { createClient } from "../../api/client";
import { getDiffUrl } from "../../api/replay.api";
import { buildCommand } from "../../command-utils/command-builder";
import { SCREENSHOT_DIFF_OPTIONS } from "../../command-utils/common-options";
import { compareImages } from "../../image/diff.utils";
import { readPng } from "../../image/io.utils";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  getReplayDir,
  getScreenshotFiles,
  getScreenshotsDir,
} from "../../local-data/replays";
import { writeScreenshotDiff } from "../../local-data/screenshot-diffs";
import { getScreenshotIdentifier } from "./utils/get-screenshot-identifier";
import { hasNotableDifferences } from "./utils/has-notable-differences";

export const diffScreenshots = async ({
  client,
  headReplayId,
  baseReplayId,
  baseScreenshotsDir,
  headScreenshotsDir,
  baseReplayScreenshots,
  headReplayScreenshots,
  diffOptions,
  logger,
}: {
  client: AxiosInstance;
  baseReplayId: string;
  headReplayId: string;
  baseScreenshotsDir: string;
  headScreenshotsDir: string;
  baseReplayScreenshots: string[];
  headReplayScreenshots: string[];
  diffOptions: ScreenshotDiffOptions;
  logger: log.Logger;
}): Promise<ScreenshotDiffResult[]> => {
  const { diffThreshold, diffPixelThreshold } = diffOptions;

  const headReplayScreenshotsSet = new Set(headReplayScreenshots);

  const missingHeadImages = new Set(
    baseReplayScreenshots.filter((file) => !headReplayScreenshotsSet.has(file))
  );

  const missingHeadImagesResults: ScreenshotDiffResult[] = Array.from(
    missingHeadImages
  ).flatMap((screenshotFileName) => {
    const identifier = getScreenshotIdentifier(screenshotFileName);
    if (identifier == null) {
      return [];
    }
    return [
      {
        identifier,
        outcome: "missing-head",
        baseScreenshotFile: `screenshots/${screenshotFileName}`,
      },
    ];
  });

  const diffAgainstBase = async (
    screenshotFileName: string
  ): Promise<ScreenshotDiffResult[]> => {
    const identifier = getScreenshotIdentifier(screenshotFileName);

    if (identifier == null) {
      return [];
    }

    if (!baseReplayScreenshots.includes(screenshotFileName)) {
      return [
        {
          identifier,
          outcome: "missing-base",
          headScreenshotFile: `screenshots/${screenshotFileName}`,
        },
      ];
    }

    const baseScreenshotFile = join(baseScreenshotsDir, screenshotFileName);
    const headScreenshotFile = join(headScreenshotsDir, screenshotFileName);
    const baseScreenshot = await readPng(baseScreenshotFile);
    const headScreenshot = await readPng(headScreenshotFile);

    if (
      baseScreenshot.width !== headScreenshot.width ||
      baseScreenshot.height !== headScreenshot.height
    ) {
      return [
        {
          identifier,
          outcome: "different-size",
          headScreenshotFile: `screenshots/${screenshotFileName}`,
          baseScreenshotFile: `screenshots/${screenshotFileName}`,
          baseWidth: baseScreenshot.width,
          baseHeight: baseScreenshot.height,
          headWidth: headScreenshot.width,
          headHeight: headScreenshot.height,
        },
      ];
    }

    const comparisonResult = compareImages({
      base: baseScreenshot,
      head: headScreenshot,
      pixelThreshold: diffPixelThreshold,
    });

    await writeScreenshotDiff({
      baseReplayId,
      headReplayId,
      screenshotFileName,
      diff: comparisonResult.diff,
    });

    return [
      {
        identifier,
        outcome:
          comparisonResult.mismatchFraction > diffThreshold
            ? "diff"
            : "no-diff",
        headScreenshotFile: `screenshots/${screenshotFileName}`,
        baseScreenshotFile: `screenshots/${screenshotFileName}`,
        width: baseScreenshot.width,
        height: baseScreenshot.height,
        mismatchPixels: comparisonResult.mismatchPixels,
        mismatchFraction: comparisonResult.mismatchFraction,
      },
    ];
  };

  const headDiffResults = (
    await Promise.all(headReplayScreenshots.map(diffAgainstBase))
  ).flat();

  const diffUrl = await getDiffUrl(client, baseReplayId, headReplayId);
  logger.info(`View screenshot diff at ${diffUrl}`);

  return [...missingHeadImagesResults, ...headDiffResults];
};

export const logDifferences = ({
  results,
  diffOptions,
  logger,
}: {
  results: ScreenshotDiffResult[];
  diffOptions: ScreenshotDiffOptions;
  logger: log.Logger;
}) => {
  const missingHeadImagesResults = results.flatMap((result) =>
    result.outcome === "missing-head" ? [result] : []
  );
  if (missingHeadImagesResults.length) {
    const message = `Head replay is missing screenshots: ${missingHeadImagesResults
      .map(({ baseScreenshotFile }) => basename(baseScreenshotFile))
      .sort()} => FAIL!`;
    logger.info(message);
  }

  const missingBaseImagesResults = results.flatMap((result) =>
    result.outcome === "missing-base" ? [result] : []
  );
  if (missingHeadImagesResults.length) {
    const message = `Notice: Base replay is missing screenshots: ${missingBaseImagesResults
      .map(({ headScreenshotFile }) => basename(headScreenshotFile))
      .sort()}`;
    logger.info(message);
  }

  results.forEach((result) => {
    const { outcome } = result;

    if (outcome === "different-size") {
      const message = `Screenshots ${basename(
        result.headScreenshotFile
      )} have different sizes => FAIL!`;
      logger.info(message);
    }

    if (outcome === "diff" || outcome === "no-diff") {
      const mismatch = (result.mismatchFraction * 100).toFixed(3);
      const threshold = (diffOptions.diffThreshold * 100).toFixed(3);
      const message = `${mismatch}% pixel mismatch for screenshot ${basename(
        result.headScreenshotFile
      )} (threshold is ${threshold}%) => ${
        outcome === "no-diff" ? "PASS" : "FAIL!"
      }`;
      logger.info(message);
    }
  });
};

export type ScreenshotDiffsSummary =
  | HasDiffsScreenshotDiffsResult
  | NoDiffsScreenshotDiffsResult;

export interface HasDiffsScreenshotDiffsResult {
  hasDiffs: true;
  summaryMessage: string;
  baseReplayId: string;
  headReplayId: string;
}

export interface NoDiffsScreenshotDiffsResult {
  hasDiffs: false;
}

interface Options {
  apiToken?: string | null | undefined;
  baseSimulationId: string;
  headSimulationId: string;
  threshold: number;
  pixelThreshold: number;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  baseSimulationId: baseReplayId,
  headSimulationId: headReplayId,
  threshold,
  pixelThreshold,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  await getOrFetchReplay(client, baseReplayId);
  await getOrFetchReplayArchive(client, baseReplayId);
  await getOrFetchReplay(client, headReplayId);
  await getOrFetchReplayArchive(client, headReplayId);

  const baseScreenshotsDir = getScreenshotsDir(getReplayDir(baseReplayId));
  const headScreenshotsDir = getScreenshotsDir(getReplayDir(headReplayId));

  const diffOptions: ScreenshotDiffOptions = {
    diffThreshold: threshold,
    diffPixelThreshold: pixelThreshold,
  };

  const baseReplayScreenshots = await getScreenshotFiles(baseScreenshotsDir);
  const headReplayScreenshots = await getScreenshotFiles(headScreenshotsDir);

  const results = await diffScreenshots({
    client,
    baseReplayId,
    headReplayId,
    baseScreenshotsDir,
    headScreenshotsDir,
    baseReplayScreenshots,
    headReplayScreenshots,
    diffOptions,
    logger,
  });

  logger.debug(results);

  logDifferences({
    results,
    diffOptions,
    logger,
  });

  if (hasNotableDifferences(results)) {
    process.exit(1);
  }
};

export const screenshotDiffCommand = buildCommand("screenshot-diff")
  .details({ describe: "Diff two replay screenshots" })
  .options({
    apiToken: {
      string: true,
    },
    baseSimulationId: {
      string: true,
      demandOption: true,
      alias: "baseReplayId",
    },
    headSimulationId: {
      string: true,
      demandOption: true,
      alias: "headReplayId",
    },
    threshold: SCREENSHOT_DIFF_OPTIONS.diffThreshold,
    pixelThreshold: SCREENSHOT_DIFF_OPTIONS.diffPixelThreshold,
  })
  .handler(handler);
