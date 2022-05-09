import { AxiosInstance } from "axios";
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
  const threshold = threshold_ || DEFAULT_MISMATCH_THRESHOLD;

  const pixelmatchOptions: CompareImageOptions["pixelmatchOptions"] | null =
    pixelThreshold ? { threshold: pixelThreshold } : null;

  const { mismatchPixels, mismatchFraction, diff } = compareImages({
    base: baseScreenshot,
    head: headScreenshot,
    ...(pixelmatchOptions ? pixelmatchOptions : {}),
  });
  console.log({ mismatchPixels, mismatchFraction });
  console.log(
    `${Math.round(
      mismatchFraction * 100
    )}% pixel mismatch (threshold is ${Math.round(threshold * 100)}%) => ${
      mismatchFraction > threshold ? "FAIL!" : "PASS"
    }`
  );

  await writeScreenshotDiff({ baseReplayId, headReplayId, diff });
  const diffUrl = await getDiffUrl(client, baseReplayId, headReplayId);
  console.log(`View screenshot diff at ${diffUrl}`);

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
    console.log("Screenshots do not match!");
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
  handler,
};
