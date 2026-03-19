import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import http from "http";
import https from "https";
import { join } from "path";
import { tmpdir } from "os";
import { pipeline } from "stream/promises";
import { createClient, getScreenshotUrls } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
}

const downloadFile = (url: string, filePath: string): Promise<void> => {
  const get = url.startsWith("https") ? https.get : http.get;
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, filePath).then(resolve, reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }
      const fileStream = createWriteStream(filePath);
      pipeline(response, fileStream).then(resolve, reject);
    }).on("error", reject);
  });
};

const downloadImageToTmpDir = async (
  tmpDir: string,
  label: string,
  url: string,
): Promise<string> => {
  const extension = getExtensionFromUrl(url);
  const filePath = join(tmpDir, `${label}${extension}`);
  await downloadFile(url, filePath);
  return filePath;
};

const getExtensionFromUrl = (url: string): string => {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(\w+)$/);
    if (match) {
      return `.${match[1]}`;
    }
  } catch {
    // Fall through to default
  }
  return ".png";
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
