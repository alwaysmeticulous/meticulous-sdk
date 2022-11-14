import { basename, join } from "path";
import {
  ScreenshotDiffOptions,
  ScreenshotDiffResult,
  ScreenshotDiffResultMissingBase,
  ScreenshotDiffResultMissingHead,
  ScreenshotIdentifier,
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

export const diffScreenshots = async ({
  client,
  headReplayId,
  baseReplayId,
  headScreenshotsDir,
  baseScreenshotsDir,
  diffOptions,
}: {
  client: AxiosInstance;
  baseReplayId: string;
  headReplayId: string;
  baseScreenshotsDir: string;
  headScreenshotsDir: string;
  diffOptions: ScreenshotDiffOptions;
}): Promise<ScreenshotDiffResult[]> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const { diffThreshold, diffPixelThreshold } = diffOptions;

  const baseReplayScreenshots = await getScreenshotFiles(baseScreenshotsDir);
  const headReplayScreenshots = await getScreenshotFiles(headScreenshotsDir);

  const missingHeadImages = new Set(
    baseReplayScreenshots.filter(
      (file) => !headReplayScreenshots.includes(file)
    )
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
      baseScreenshot.width !== baseScreenshot.width ||
      headScreenshot.height !== headScreenshot.height
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

export const checkScreenshotDiffResult = ({
  baseReplayId,
  headReplayId,
  results,
  diffOptions,
}: {
  baseReplayId: string;
  headReplayId: string;
  results: ScreenshotDiffResult[];
  diffOptions: ScreenshotDiffOptions;
}): void => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const missingHeadImagesResults = results.filter(
    ({ outcome }) => outcome === "missing-head"
  ) as ScreenshotDiffResultMissingHead[];
  if (missingHeadImagesResults.length) {
    const message = `Head replay is missing screenshots: ${missingHeadImagesResults
      .map(({ baseScreenshotFile }) => baseScreenshotFile)
      .sort()} => FAIL!`;
    logger.info(message);
    throw new ScreenshotDiffError(message, {
      baseReplayId,
      headReplayId,
    });
  }

  const missingBaseImagesResults = results.filter(
    ({ outcome }) => outcome === "missing-base"
  ) as ScreenshotDiffResultMissingBase[];
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
      throw new ScreenshotDiffError(message, {
        baseReplayId,
        headReplayId,
      });
    }

    if (outcome === "diff" || outcome === "no-diff") {
      const mismatch = Math.round(result.mismatchFraction * 100);
      const threshold = Math.round(diffOptions.diffThreshold * 100);
      const message = `${mismatch}% pixel mismatch for screenshot ${basename(
        result.headScreenshotFile
      )} (threshold is ${threshold}%) => ${
        outcome === "no-diff" ? "PASS" : "FAIL!"
      }`;
      logger.info(message);
      if (outcome === "diff") {
        throw new ScreenshotDiffError(message, {
          baseReplayId,
          headReplayId,
        });
      }
    }
  });
};

export class ScreenshotDiffError extends Error {
  constructor(
    message: string,
    readonly extras?: {
      baseReplayId: string;
      headReplayId: string;
    }
  ) {
    super(message);
  }
}

const getScreenshotIdentifier = (
  filename: string
): ScreenshotIdentifier | undefined => {
  const name = basename(filename);

  if (name === "final-state.png") {
    return {
      type: "end-state",
    };
  }

  if (name.startsWith("screenshot-after-event")) {
    const match = name.match(/^(?:.*)-(\d+)[.]png$/);
    const eventNumber = match ? parseInt(match[1], 10) : undefined;

    if (match && eventNumber != null && !isNaN(eventNumber)) {
      return {
        type: "after-event",
        eventNumber: eventNumber - 1,
      };
    }
  }

  return undefined;
};

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

  const results = await diffScreenshots({
    client,
    baseReplayId,
    headReplayId,
    baseScreenshotsDir,
    headScreenshotsDir,
    diffOptions,
  });

  logger.debug(results);

  checkScreenshotDiffResult({
    baseReplayId,
    headReplayId,
    results,
    diffOptions,
  });
};

export const screenshotDiff = buildCommand("screenshot-diff")
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
