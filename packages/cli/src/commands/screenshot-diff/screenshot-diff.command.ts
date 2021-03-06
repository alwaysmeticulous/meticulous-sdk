import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { PNG } from "pngjs";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { getDiffUrl, postScreenshotDiffStats } from "../../api/replay.api";
import { CompareImageOptions, compareImages } from "../../image/diff.utils";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  readReplayScreenshot,
} from "../../local-data/replays";
import { writeScreenshotDiff } from "../../local-data/screenshot-diffs";
import { wrapHandler } from "../../utils/sentry.utils";

const DEFAULT_MISMATCH_THRESHOLD = 0.01;

export class DiffError extends Error {
  constructor(
    message: string,
    readonly extras?: {
      baseReplayId: string;
      headReplayId: string;
      threshold: number;
      value: number;
    }
  ) {
    super(message);
  }
}

export const diffScreenshots: (options: {
  client: AxiosInstance;
  baseReplayId: string;
  headReplayId: string;
  baseScreenshot: PNG;
  headScreenshot: PNG;
  threshold: number | null | undefined;
  pixelThreshold: number | null | undefined;
  exitOnMismatch: boolean;
}) => Promise<void> = async ({
  client,
  baseReplayId,
  headReplayId,
  baseScreenshot,
  headScreenshot,
  threshold: threshold_,
  pixelThreshold,
  exitOnMismatch,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const threshold = threshold_ || DEFAULT_MISMATCH_THRESHOLD;
  const pixelmatchOptions: CompareImageOptions["pixelmatchOptions"] | null =
    pixelThreshold ? { threshold: pixelThreshold } : null;

  try {
    const { mismatchPixels, mismatchFraction, diff } = compareImages({
      base: baseScreenshot,
      head: headScreenshot,
      ...(pixelmatchOptions ? pixelmatchOptions : {}),
    });

    logger.debug({ mismatchPixels, mismatchFraction });
    logger.info(
      `${Math.round(
        mismatchFraction * 100
      )}% pixel mismatch (threshold is ${Math.round(threshold * 100)}%) => ${
        mismatchFraction > threshold ? "FAIL!" : "PASS"
      }`
    );

    await writeScreenshotDiff({ baseReplayId, headReplayId, diff });
    const diffUrl = await getDiffUrl(client, baseReplayId, headReplayId);
    logger.info(`View screenshot diff at ${diffUrl}`);

    await postScreenshotDiffStats(client, {
      baseReplayId,
      headReplayId,
      stats: {
        width: baseScreenshot.width,
        height: baseScreenshot.height,
        mismatchPixels,
      },
    });

    if (mismatchFraction > threshold) {
      logger.info("Screenshots do not match!");
      if (exitOnMismatch) {
        process.exit(1);
      }
      throw new DiffError("Screenshots do not match!", {
        baseReplayId,
        headReplayId,
        threshold,
        value: mismatchFraction,
      });
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
};

interface Options {
  apiToken?: string | null | undefined;
  baseReplayId: string;
  headReplayId: string;
  threshold?: number | null | undefined;
  pixelThreshold?: number | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  baseReplayId,
  headReplayId,
  threshold,
  pixelThreshold,
}) => {
  const client = createClient({ apiToken });

  await getOrFetchReplay(client, baseReplayId);
  await getOrFetchReplayArchive(client, baseReplayId);
  await getOrFetchReplay(client, headReplayId);
  await getOrFetchReplayArchive(client, headReplayId);

  const baseScreenshot = await readReplayScreenshot(baseReplayId);
  const headScreenshot = await readReplayScreenshot(headReplayId);

  await diffScreenshots({
    client,
    baseReplayId,
    headReplayId,
    baseScreenshot,
    headScreenshot,
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
    baseReplayId: {
      string: true,
      demandOption: true,
    },
    headReplayId: {
      string: true,
      demandOption: true,
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
