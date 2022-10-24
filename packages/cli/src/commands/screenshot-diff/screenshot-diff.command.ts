import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log, { Logger } from "loglevel";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { getDiffUrl, postScreenshotDiffStats } from "../../api/replay.api";
import { CompareImageResult, compareImages } from "../../image/diff.utils";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  getReplayDir,
  getScreenshotFiles,
  getScreenshotsDir,
} from "../../local-data/replays";
import { writeScreenshotDiff } from "../../local-data/screenshot-diffs";
import { wrapHandler } from "../../utils/sentry.utils";
import { readPng } from "../../image/io.utils";
import { basename, join } from "path";

const DEFAULT_MISMATCH_THRESHOLD = 0.01;

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
  threshold: number | null | undefined;
  pixelThreshold: number | null | undefined;
  exitOnMismatch: boolean;
}) => Promise<ScreenshotDiffResult[]> = async ({
  client,
  baseReplayId,
  headReplayId,
  baseScreenshotsDir,
  headScreenshotsDir,
  threshold: threshold_,
  pixelThreshold,
  exitOnMismatch,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const threshold = threshold_ || DEFAULT_MISMATCH_THRESHOLD;

  const baseReplayScreenshots = await getScreenshotFiles(baseScreenshotsDir);
  const headReplayScreenshots = await getScreenshotFiles(headScreenshotsDir);

  // Assume base replay screenshots are always a subset of the head replay screenshots.
  // We report any missing base replay screenshots for visibility but don't count it as a difference.
  const missingHeadImages = new Set(
    [...baseReplayScreenshots].filter(
      (file_) => !headReplayScreenshots.includes(file_)
    )
  );

  let totalMismatchPixels = 0;
  let totalComparedPixels = 0;

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
          threshold,
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
        pixelThreshold: pixelThreshold ?? null,
      });

      totalMismatchPixels += comparisonResult.mismatchPixels;
      totalComparedPixels += baseScreenshot.width * baseScreenshot.height;

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
          comparisonResult.mismatchFraction > threshold ? "fail" : "pass",
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
        )} (threshold is ${Math.round(threshold * 100)}%)`,
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
          threshold,
        }
      );
    }

    const totalMismatchedFraction = totalMismatchPixels / totalComparedPixels;
    const overallMismatchOutcome: ComparisonOutcome =
      totalMismatchedFraction > threshold ? "fail" : "pass";

    logComparisonResultMessage(
      logger,
      "Mismatch across all screenshots",
      overallMismatchOutcome
    );

    if (overallMismatchOutcome === "fail") {
      if (exitOnMismatch) {
        process.exit(1);
      }

      throw new DiffError(
        `Total mismatch across screenshots above is ${threshold}!`,
        {
          baseReplayId,
          headReplayId,
          threshold,
          value: totalMismatchedFraction,
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
      threshold,
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
  logger.info(`${message} => ${outcome === "fail" ? "FAIL!" : "PASS"}`);
};

interface Options {
  apiToken?: string | null | undefined;
  baseSimulationId: string;
  headSimulationId: string;
  threshold?: number | null | undefined;
  pixelThreshold?: number | null | undefined;
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
    threshold,
    pixelThreshold,
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
    threshold: {
      number: true,
    },
    pixelThreshold: {
      number: true,
    },
  },
  handler: wrapHandler(handler),
};
