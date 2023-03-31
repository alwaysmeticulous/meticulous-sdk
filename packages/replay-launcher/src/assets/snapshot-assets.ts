import { mkdir, writeFile } from "fs/promises";
import { dirname, extname, join } from "path";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { Duration } from "luxon";
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

interface SnapshotAssetsOpts {
  assetsPath: string;
  baseUrl: string;
  assetSnapshots: AssetSnapshot[];
}

const TIMEOUT_FOR_FETCHING_ASSET = Duration.fromObject({ seconds: 5 });

export const snapshotAssets: (
  options: SnapshotAssetsOpts
) => Promise<void> = async (options) => {
  const { baseUrl, assetSnapshots } = options;
  await Promise.all(
    uniqueByRequestUrl(assetSnapshots)
      .filter((snapshot) => snapshot.url.startsWith(baseUrl))
      .map((snapshot) => snapshotAssetWithTimeout({ ...options, snapshot }))
  );
  return;
};

const snapshotAssetWithTimeout: (
  options: SnapshotAssetsOpts & { snapshot: AssetSnapshot }
) => Promise<void> = async (options) => {
  const { snapshot } = options;
  const assetPromise = snapshotAsset(options);
  const timeLimitedPromise = withTimeout(
    assetPromise,
    TIMEOUT_FOR_FETCHING_ASSET,
    `Timed out snapshotting asset for URL ${snapshot.url}`
  );
  return timeLimitedPromise.catch((err) => {
    // We catch and quietly log any errors since asset snapshots
    // are non-essential/for debugging purposes: we'd rather they fail to
    // capture, than the CLI fails altogether.
    log.debug(`Error fetching asset at URL ${snapshot.url}`, err);
  });
};

const snapshotAsset: (
  options: SnapshotAssetsOpts & { snapshot: AssetSnapshot }
) => Promise<void> = async ({ snapshot, baseUrl, assetsPath }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const trimmedUrl = withoutQueryParams(snapshot.url).substring(baseUrl.length);
  const targetFile = join(
    assetsPath,
    getFilePath(trimmedUrl, snapshot.contentType)
  );
  await mkdir(dirname(targetFile), { recursive: true });

  try {
    const data = await snapshot.getData();
    return writeFile(targetFile, data, { flag: "w" });
  } catch (error: unknown) {
    // There seems to be no other way to tell apart a cancelled request from a normal one
    // apart from catching the error when trying to read the data (cancelled requests
    // seem to still have 200 status etc. in Puppeteer oddly). We ignore this, since we don't
    // care about snapshotting assets for cancelled requests.
    if ((error as any)?.name === "ProtocolError") {
      logger.debug(
        `ProtocolError when fetching snapshotted asset for URL ${snapshot.url}. Ignoring this, ` +
          `because it's usually due to cancelled requests.`
      );
      return;
    }

    throw error;
  }
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
const withoutQueryParams: (url: string) => string = (url) => {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.toString();
};

const getFilePath: (trimmedUrl: string, contentType: string) => string = (
  trimmedUrl,
  contentType
) => {
  const hasHTMLContentType = contentType.includes("text/html");
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
};

const withTimeout: <T>(
  promise: Promise<T>,
  timeoutDuration: Duration,
  timeoutMessage: string
) => Promise<T> = (promise, timeoutDuration, timeoutMessage) => {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      const cancellationId = setTimeout(
        () => reject(timeoutMessage),
        timeoutDuration.toMillis()
      );
      promise.finally(() => clearTimeout(cancellationId));
    }),
  ]);
};

// We only care to snapshot the first response for a given URL
const uniqueByRequestUrl: (assets: AssetSnapshot[]) => AssetSnapshot[] = (
  assets
) => {
  const requestUrls = new Set<string>();
  return assets.filter((snapshot) => {
    if (requestUrls.has(snapshot.url)) {
      return false;
    }
    requestUrls.add(snapshot.url);
    return true;
  });
};
