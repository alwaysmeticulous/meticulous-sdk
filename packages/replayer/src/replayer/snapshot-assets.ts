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
        const trimmedUrl = withoutQueryParams(url).substring(
          opts.baseUrl.length
        );
        downloadFile(url, join(assetsPath, getFilePath(trimmedUrl)));
      })
  );
};

// We ignore query params for now
// It's possible that in future we may get clashes. An example would be if
// a customer has set up a server that uses query params to fetch different resources:
// `/get-script?scriptId=main.js` and `/get-script?scriptId=web-worker.js`.
//
// It is possible therefore that we may need to update this in future, however it adds
// a little complexity on the server side (e.g. we'd need to save a mappings.json file that
// maps from exact URL to the contents of returned resource, and serve requests based on this,
// and we'd lose the debuggability of a simple folder structure).
function withoutQueryParams(url: string) {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.toString();
}

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
