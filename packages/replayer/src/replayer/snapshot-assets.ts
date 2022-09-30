import axios from "axios";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { HTTPRequest, ResourceType } from "puppeteer";
import { finished } from "stream";
import { promisify } from "util";

const resourceTypesToSnapshot = new Set<ResourceType>([
  "document",
  "font",
  "image",
  "stylesheet",
  "script",
  "media",
]);
export const isRequestForAsset = (request: HTTPRequest) =>
  resourceTypesToSnapshot.has(request.resourceType());

export const snapshotAssets = async (opts: {
  tempDir: string;
  baseUrl: string;
  assetUrls: string[];
}) => {
  const assetsPath = join(opts.tempDir, "snapshotted-assets");
  mkdir(assetsPath, {
    recursive: true,
  });
  return Promise.all(
    opts.assetUrls
      .filter((url) => url.startsWith(opts.baseUrl))
      .map((url) => {
        const trimmedUrl = url.substring(opts.baseUrl.length);
        downloadFile(url, join(assetsPath, getFilePath(trimmedUrl)));
      })
  );
};

function getFilePath(trimmedUrl: string) {
  if (trimmedUrl === "" || trimmedUrl.endsWith("/")) {
    return join(trimmedUrl, "index.html");
  }
  return trimmedUrl;
}

const promisifiedFinished = promisify(finished);

async function downloadFile(url: string, targetFile: string) {
  await mkdir(dirname(targetFile), { recursive: true });
  const writer = createWriteStream(targetFile);
  return axios
    .request({ method: "GET", url: url, responseType: "stream" })
    .then(async (response) => {
      response.data.pipe(writer);
      return promisifiedFinished(writer);
    });
}
