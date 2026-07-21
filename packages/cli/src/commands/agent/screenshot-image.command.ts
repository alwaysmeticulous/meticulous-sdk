import {
  createClientWithOAuth,
  getScreenshotUrls,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  json,
}: Options): Promise<void> => {
  initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const urls = await getScreenshotUrls(client, replayDiffId, screenshotName);

  if (json) {
    printJson(urls);
    return;
  }

  console.log(`outcome:\t${urls.outcome}`);
  if (urls.before) {
    console.log(`before:\t${urls.before}`);
  }
  if (urls.after) {
    console.log(`after:\t${urls.after}`);
  }
  if (urls.diffImage) {
    console.log(`diffImage:\t${urls.diffImage}`);
  }
};

export const imageUrlsCommand: CommandModule<unknown, Options> = {
  command: "image-urls",
  describe:
    "Get the signed URLs for the images of a screenshot diff. Outputs a line with the outcome (diff, no-diff, etc) and a line with the URL per image (before/after/diffImage).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description: "The replay diff ID.",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description:
        'The screenshot name, as listed in the screenshotName column of `agent test-run-diffs` (e.g. "after-event-5" or "end-state").',
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
