import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { postScreenshotDiffStats } from "../../api/replay.api";
import { CompareImageOptions, compareImages } from "../../image/diff.utils";
import {
  getOrFetchReplay,
  getOrFetchReplayArchive,
  readReplayScreenshot,
} from "../../local-data/replays";
import { writeScreenshotDiff } from "../../local-data/screenshot-diffs";

const DEFAULT_MISMATCH_THRESHOLD = 0.01;

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
  threshold: threshold_,
  pixelThreshold,
}) => {
  const client = createClient({ apiToken });

  await getOrFetchReplay(client, baseReplayId);
  await getOrFetchReplayArchive(client, baseReplayId);
  await getOrFetchReplay(client, headReplayId);
  await getOrFetchReplayArchive(client, headReplayId);

  const baseScreenshot = await readReplayScreenshot(baseReplayId);
  const headScreenshot = await readReplayScreenshot(headReplayId);

  const pixelmatchOptions: CompareImageOptions["pixelmatchOptions"] | null =
    pixelThreshold ? { threshold: pixelThreshold } : null;

  const { mismatchPixels, mismatchFraction, diff } = compareImages({
    base: baseScreenshot,
    head: headScreenshot,
    ...(pixelmatchOptions ? pixelmatchOptions : {}),
  });
  console.log({ mismatchPixels, mismatchFraction });

  await writeScreenshotDiff({ baseReplayId, headReplayId, diff });

  await postScreenshotDiffStats(client, {
    baseReplayId,
    headReplayId,
    stats: {
      width: baseScreenshot.width,
      height: baseScreenshot.height,
      mismatchPixels,
    },
  });

  const threshold = threshold_ || DEFAULT_MISMATCH_THRESHOLD;
  if (mismatchFraction > threshold) {
    console.log("Screenshots do not match!");
    process.exit(1);
  }
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
