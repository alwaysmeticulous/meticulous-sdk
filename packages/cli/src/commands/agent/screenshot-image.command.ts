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

  console.log(`outcome: ${urls.outcome}`);
  if (urls.screenshot) {
    console.log(`screenshot: ${urls.screenshot}`);
  }
  if (urls.before) {
    console.log(`before: ${urls.before}`);
  }
  if (urls.after) {
    console.log(`after: ${urls.after}`);
  }
  if (urls.diffImage) {
    console.log(`diffImage: ${urls.diffImage}`);
  }
};

export const imageUrlsCommand: CommandModule<unknown, Options> = {
  command: "image-urls",
  describe:
    "Get screenshot image URLs for a replay diff screenshot. Outputs an outcome line then screenshot/before/after/diffImage URL lines (or JSON with --json).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    replayDiffId: {
      string: true,
      description: "The replay diff ID",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description:
        'Screenshot name, exactly as listed in the screenshotName column of `agent test-run-diffs` for this replay diff (e.g. "after-event-5", "end-state", or "auxiliary-291-0-exit_animation")',
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
