import { mkdir, writeFile } from "fs/promises";
import { dirname, extname, join } from "path";
import { HTTPRequest, ResourceType } from "puppeteer";
import { AssetSnapshot } from "./assets.types";

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
  assetsPath: string;
  baseUrl: string;
  assetSnapshots: AssetSnapshot[];
}) => {
  return Promise.all(
    opts.assetSnapshots
      .filter((snapshot) => snapshot.url.startsWith(opts.baseUrl))
      .map(async (snapshot) => {
        const trimmedUrl = withoutQueryParams(snapshot.url).substring(
          opts.baseUrl.length
        );
        const targetFile = join(
          opts.assetsPath,
          getFilePath(trimmedUrl, snapshot.contentType)
        );
        await mkdir(dirname(targetFile), { recursive: true });

        const data = await snapshot.data;

        return writeFile(targetFile, data, { flag: "w" });
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

function getFilePath(trimmedUrl: string, contentType: string | undefined) {
  const hasHTMLContentType =
    contentType !== undefined && contentType.indexOf("text/html") > -1;
  const extension = extname(trimmedUrl);
  const hasHTMLExtension = extension === "html" || extension === "htm";
  if (
    trimmedUrl === "" ||
    trimmedUrl.endsWith("/") ||
    (hasHTMLContentType && !hasHTMLExtension)
  ) {
    return join(trimmedUrl, "index.html");
  }
  return trimmedUrl;
}
