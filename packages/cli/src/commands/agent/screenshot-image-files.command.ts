import { mkdir, readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { createClient, getScreenshotUrls } from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  initLogger,
} from "@alwaysmeticulous/common";
import { downloadFile } from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
}

const AGENT_IMAGES_SUBDIR = "agent-images";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const getAgentImagesDir = (): string =>
  join(getMeticulousLocalDataDir(), AGENT_IMAGES_SUBDIR);

const cleanupOldImages = async (dir: string): Promise<void> => {
  const logger = initLogger();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - MAX_AGE_MS;
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(dir, entry);
      try {
        const stats = await stat(entryPath);
        if (stats.isFile() && stats.mtimeMs < cutoff) {
          await unlink(entryPath);
        }
      } catch (error) {
        logger.debug(`Failed to inspect/remove ${entryPath}: ${error}`);
      }
    }),
  );
};

const downloadImage = async (
  dir: string,
  fileName: string,
  url: string,
): Promise<string> => {
  const filePath = join(dir, fileName);
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

  const dir = getAgentImagesDir();
  await mkdir(dir, { recursive: true });
  await cleanupOldImages(dir);

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

  const timestamp = Date.now();
  const prefix = `${timestamp}_${replayDiffId}_${screenshotName}`;

  const results = await Promise.all(
    downloads.map(({ label, url }) =>
      downloadImage(dir, `${prefix}_${label}.png`, url),
    ),
  );

  for (let i = 0; i < downloads.length; i++) {
    console.log(`${downloads[i].label}: ${results[i]}`);
  }
};

export const imageFilesCommand: CommandModule<unknown, Options> = {
  command: "image-files",
  describe:
    "Download screenshot images for a replay diff screenshot to local files under ~/.meticulous/agent-images",
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
