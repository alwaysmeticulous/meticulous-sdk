import { basename, join } from "path";
import {
  ScreenshotDiffOptions,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import stringify from "fast-json-stable-stringify";
import log from "loglevel";
import { createClient } from "../../api/client";
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
  IdentifiedScreenshotFile,
} from "../../local-data/replays";
import { writeScreenshotDiff } from "../../local-data/screenshot-diffs";
import { hasNotableDifferences } from "./utils/has-notable-differences";

export const diffScreenshots = async ({
  headReplayId,
  baseReplayId,
  baseScreenshotsDir,
  headScreenshotsDir,
  baseReplayScreenshots,
  headReplayScreenshots,
  diffOptions,
}: {
  baseReplayId: string;
  headReplayId: string;
  baseScreenshotsDir: string;
  headScreenshotsDir: string;
  baseReplayScreenshots: IdentifiedScreenshotFile[];
  headReplayScreenshots: IdentifiedScreenshotFile[];
  diffOptions: ScreenshotDiffOptions;
}): Promise<ScreenshotDiffResult[]> => {
  const { diffThreshold, diffPixelThreshold } = diffOptions;

  const headReplayScreenshotsByIdentifier = new Map<
    string,
    IdentifiedScreenshotFile
  >(
    headReplayScreenshots.map((screenshot) => [
      stringify(screenshot.identifier),
      screenshot,
    ])
  );
  const baseReplayScreenshotsByIdentifier = new Map<
    string,
    IdentifiedScreenshotFile
  >(
    baseReplayScreenshots.map((screenshot) => [
      stringify(screenshot.identifier),
      screenshot,
    ])
  );

  const missingHeadImages = new Set(
    baseReplayScreenshots.filter(
      (file) =>
        !headReplayScreenshotsByIdentifier.has(stringify(file.identifier))
    )
  );

  const missingHeadImagesResults: ScreenshotDiffResult[] = Array.from(
    missingHeadImages
  ).flatMap(({ identifier, fileName }) => {
    return [
      {
        identifier,
        outcome: "missing-head",
        baseScreenshotFile: `screenshots/${fileName}`,
      },
    ];
  });

  const diffAgainstBase = async (
    headScreenshot: IdentifiedScreenshotFile
  ): Promise<ScreenshotDiffResult[]> => {
    const baseScreenshot = baseReplayScreenshotsByIdentifier.get(
      stringify(headScreenshot.identifier)
    );
    if (baseScreenshot == null) {
      return [
        {
          identifier: headScreenshot.identifier,
          outcome: "missing-base",
          headScreenshotFile: `screenshots/${headScreenshot.fileName}`,
        },
      ];
    }

    const baseScreenshotFile = join(
      baseScreenshotsDir,
      baseScreenshot.fileName
    );
    const headScreenshotFile = join(
      headScreenshotsDir,
      headScreenshot.fileName
    );
    const baseScreenshotContents = await readPng(baseScreenshotFile);
    const headScreenshotContents = await readPng(headScreenshotFile);

    if (
      baseScreenshotContents.width !== headScreenshotContents.width ||
      baseScreenshotContents.height !== headScreenshotContents.height
    ) {
      return [
        {
          identifier: headScreenshot.identifier,
          outcome: "different-size",
          baseScreenshotFile: `screenshots/${baseScreenshot.fileName}`,
          headScreenshotFile: `screenshots/${headScreenshot.fileName}`,
          baseWidth: baseScreenshotContents.width,
          baseHeight: baseScreenshotContents.height,
          headWidth: headScreenshotContents.width,
          headHeight: headScreenshotContents.height,
        },
      ];
    }

    const comparisonResult = compareImages({
      base: baseScreenshotContents,
      head: headScreenshotContents,
      pixelThreshold: diffPixelThreshold,
    });

    await writeScreenshotDiff({
      baseReplayId,
      headReplayId,
      screenshotFileName: headScreenshot.fileName,
      diff: comparisonResult.diff,
    });

    return [
      {
        identifier: headScreenshot.identifier,
        outcome:
          comparisonResult.mismatchFraction > diffThreshold
            ? "diff"
            : "no-diff",
        baseScreenshotFile: `screenshots/${baseScreenshot.fileName}`,
        headScreenshotFile: `screenshots/${headScreenshot.fileName}`,
        width: baseScreenshotContents.width,
        height: baseScreenshotContents.height,
        mismatchPixels: comparisonResult.mismatchPixels,
        mismatchFraction: comparisonResult.mismatchFraction,
      },
    ];
  };

  const headDiffResults = (
    await Promise.all(headReplayScreenshots.map(diffAgainstBase))
  ).flat();

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
    baseReplayId,
    headReplayId,
    baseScreenshotsDir,
    headScreenshotsDir,
    baseReplayScreenshots,
    headReplayScreenshots,
    diffOptions,
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
