import { mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createClient, getScreenshotUrls } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { downloadFile } from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
}

const downloadImageToTmpDir = async (
  tmpDir: string,
  label: string,
  url: string,
): Promise<string> => {
  const filePath = join(tmpDir, `${label}.png`);
  await downloadFile(url, filePath);
  return filePath;
};

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
}: Options): Promise<void> => {
  initLogger();
  const client = createClient({ apiToken });

  const urls = await getScreenshotUrls(client, replayDiffId, screenshotName);

  const tmpDir = join(
    tmpdir(),
    "meticulous-screenshots",
    `${replayDiffId}_${screenshotName}`,
  );
  await mkdir(tmpDir, { recursive: true });

  console.log(`outcome: ${urls.outcome}`);

  const downloads: Array<{ label: string; url: string }> = [];
  if (urls.screenshot) {
    downloads.push({ label: "screenshot", url: urls.screenshot });
  }
  if (urls.before) {
    downloads.push({ label: "before", url: urls.before });
  }
  if (urls.after) {
    downloads.push({ label: "after", url: urls.after });
  }
  if (urls.diffImage) {
    downloads.push({ label: "diffImage", url: urls.diffImage });
  }

  const results = await Promise.all(
    downloads.map(({ label, url }) =>
      downloadImageToTmpDir(tmpDir, label, url),
    ),
  );

  for (let i = 0; i < downloads.length; i++) {
    console.log(`${downloads[i].label}: ${results[i]}`);
  }
};

export const imageFilesCommand: CommandModule<unknown, Options> = {
  command: "image-files",
  describe:
    "Download screenshot images for a replay diff screenshot to local tmp files",
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
