import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { compareImages } from "../../image/diff.utils";
import { writePng } from "../../image/io.utils";
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
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  baseReplayId,
  headReplayId,
  threshold: threshold_,
}) => {
  const client = createClient({ apiToken });

  await getOrFetchReplay(client, baseReplayId);
  await getOrFetchReplayArchive(client, baseReplayId);
  await getOrFetchReplay(client, headReplayId);
  await getOrFetchReplayArchive(client, headReplayId);

  const baseScreenshot = await readReplayScreenshot(baseReplayId);
  const headScreenshot = await readReplayScreenshot(headReplayId);

  const { mismatchPixels, mismatchFraction, diff } = compareImages({
    base: baseScreenshot,
    head: headScreenshot,
  });
  console.log({ mismatchPixels, mismatchFraction });

  await writeScreenshotDiff({ baseReplayId, headReplayId, diff });

  const threshold = threshold_ || DEFAULT_MISMATCH_THRESHOLD;
  if (mismatchFraction > threshold) {
    console.log("Screenshots do not match!");
    process.exit(1);
  }
};

export const screenshotDiff: CommandModule<{}, Options> = {
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
  },
  handler,
};
