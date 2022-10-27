import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log, { Logger } from "loglevel";
import { basename, join } from "path";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { getDiffUrl, postScreenshotDiffStats } from "../../api/replay.api";
import { SCREENSHOT_DIFF_OPTIONS } from "../../command-utils/common-options";
import { ScreenshotDiffOptions } from "../../command-utils/common-types";
import { CompareImageResult, compareImages } from "../../image/diff.utils";
import { readPng } from "../../image/io.utils";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  getReplayDir,
  getScreenshotFiles,
  getScreenshotsDir,
} from "../../local-data/replays";
import { writeScreenshotDiff } from "../../local-data/screenshot-diffs";
import { wrapHandler } from "../../utils/sentry.utils";

export class DiffError extends Error {
  constructor(
    message: string,
    readonly extras?: {
      baseReplayId: string;
      headReplayId: string;
      threshold: number;
      value?: number;
    }
  ) {
    super(message);
  }
}

type ComparisonOutcome = "pass" | "fail";

export interface ScreenshotDiffResult {
  baseScreenshotFile: string;
  headScreenshotFile: string;

  outcome: ComparisonOutcome;
  comparisonResult: CompareImageResult;
}

export const diffScreenshots: (options: {
  client: AxiosInstance;
  baseReplayId: string;
  headReplayId: string;
  baseScreenshotsDir: string;
  headScreenshotsDir: string;
  diffOptions: ScreenshotDiffOptions;
  exitOnMismatch: boolean;
}) => Promise<ScreenshotDiffResult[]> = async ({
  client,
  baseReplayId,
  headReplayId,
  baseScreenshotsDir,
  headScreenshotsDir,
  diffOptions,
  exitOnMismatch,
}) => {
  const { diffThreshold, diffPixelThreshold } = diffOptions;
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const baseReplayScreenshots = await getScreenshotFiles(baseScreenshotsDir);
  const headReplayScreenshots = await getScreenshotFiles(headScreenshotsDir);

  // Assume base replay screenshots are always a subset of the head replay screenshots.
  // We report any missing base replay screenshots for visibility but don't count it as a difference.
  const missingHeadImages = new Set(
    [...baseReplayScreenshots].filter(
      (file) => !headReplayScreenshots.includes(file)
    )
  );

  let totalMismatchPixels = 0;

  const comparisonResults: ScreenshotDiffResult[] = [];

  try {
    if (missingHeadImages.size > 0) {
      logComparisonResultMessage(
        logger,
        `Head replay is missing screenshots: ${[...missingHeadImages].sort()}`,
        "fail"
      );
      throw new DiffError(
        `Head replay is missing screenshots: ${[...missingHeadImages].sort()}`,
        {
          baseReplayId,
          headReplayId,
          threshold: diffThreshold,
        }
      );
    }

    for (const screenshotFileName of headReplayScreenshots) {
      if (!baseReplayScreenshots.includes(screenshotFileName)) {
        logger.info(
          `Screenshot ${screenshotFileName} not present in base replay`
        );
        continue;
      }

      const baseScreenshotFile = join(baseScreenshotsDir, screenshotFileName);
      const headScreenshotFile = join(headScreenshotsDir, screenshotFileName);
      const baseScreenshot = await readPng(baseScreenshotFile);
      const headScreenshot = await readPng(headScreenshotFile);

      const comparisonResult = compareImages({
        base: baseScreenshot,
        head: headScreenshot,
        pixelThreshold: diffPixelThreshold ?? null,
      });

      totalMismatchPixels += comparisonResult.mismatchPixels;

      logger.debug({
        screenshotFileName,
        mismatchPixels: comparisonResult.mismatchPixels,
        mismatchFraction: comparisonResult.mismatchFraction,
      });

      await writeScreenshotDiff({
        baseReplayId,
        headReplayId,
        screenshotFileName,
        diff: comparisonResult.diff,
      });

      comparisonResults.push({
        baseScreenshotFile,
        headScreenshotFile,
        comparisonResult,
        outcome:
          comparisonResult.mismatchFraction > diffThreshold ? "fail" : "pass",
      });
    }

    await postScreenshotDiffStats(client, {
      baseReplayId,
      headReplayId,
      stats: {
        width: 0,
        height: 0,
        mismatchPixels: totalMismatchPixels,
      },
    });

    const diffUrl = await getDiffUrl(client, baseReplayId, headReplayId);
    logger.info(`View screenshot diff at ${diffUrl}`);

    comparisonResults.forEach((result) => {
      logComparisonResultMessage(
        logger,
        `${Math.round(
          result.comparisonResult.mismatchFraction * 100
        )}% pixel mismatch for screenshot ${basename(
          result.headScreenshotFile
        )} (threshold is ${Math.round(diffThreshold * 100)}%)`,
        result.outcome
      );
    });

    // Check if individual screenshot mismatch is higher than the threshold.
    const mismatchingScreenshots = comparisonResults.filter(
      (result) => result.outcome == "fail"
    );

    if (mismatchingScreenshots.length) {
      logger.info(
        `Screenshots ${mismatchingScreenshots
          .map((result) => basename(result.headScreenshotFile))
          .sort()} do not match!`
      );
      if (exitOnMismatch) {
        process.exit(1);
      }
      throw new DiffError(
        `Screenshots ${mismatchingScreenshots.map((result) =>
          basename(result.headScreenshotFile)
        )} do not match!`,
        {
          baseReplayId,
          headReplayId,
          threshold: diffThreshold,
        }
      );
    }
  } catch (error) {
    if (!(error instanceof DiffError)) {
      logger.error(error);
    }
    if (exitOnMismatch) {
      process.exit(1);
    }
    throw new DiffError(`Error while diffing: ${error}`, {
      baseReplayId,
      headReplayId,
      threshold: diffThreshold,
      value: 1,
    });
  }

  return comparisonResults;
};

const logComparisonResultMessage: (
  logger: Logger,
  message: string,
  outcome: ComparisonOutcome
) => void = (logger, message, outcome) => {
  logger.info(`${message} => ${outcome === "pass" ? "PASS" : "FAIL!"}`);
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
  const client = createClient({ apiToken });

  await getOrFetchReplay(client, baseReplayId);
  await getOrFetchReplayArchive(client, baseReplayId);
  await getOrFetchReplay(client, headReplayId);
  await getOrFetchReplayArchive(client, headReplayId);

  const baseScreenshotsDir = getScreenshotsDir(getReplayDir(baseReplayId));
  const headScreenshotsDir = getScreenshotsDir(getReplayDir(headReplayId));

  await diffScreenshots({
    client,
    baseReplayId,
    headReplayId,
    baseScreenshotsDir,
    headScreenshotsDir,
    diffOptions: {
      diffThreshold: threshold,
      diffPixelThreshold: pixelThreshold,
    },
    exitOnMismatch: true,
  });
};

export const screenshotDiff: CommandModule<unknown, Options> = {
  command: "screenshot-diff",
  describe: "Diff two replay screenshots",
  builder: {
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
  },
  handler: wrapHandler(handler),
};
