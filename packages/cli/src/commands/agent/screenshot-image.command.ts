import { createClient, getScreenshotUrls } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
}: Options): Promise<void> => {
  initLogger();
  const client = createClient({ apiToken });

  const urls = await getScreenshotUrls(client, replayDiffId, screenshotName);

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
  describe: "Get screenshot image URLs for a replay diff screenshot",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    replayDiffId: {
      string: true,
      description: "The replay diff ID",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description: 'Screenshot name (e.g. "after-event-5" or "end-state")',
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
