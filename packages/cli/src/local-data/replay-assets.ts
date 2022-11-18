import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join } from "path";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  ReplayEventsDependencies,
} from "@alwaysmeticulous/common";
import axios from "axios";
import log from "loglevel";
import { getSnippetsBaseUrl } from "../config/snippets";

interface AssetMetadataItem {
  fileName: string;
  etag: string;
  fetchUrl: string;
}

interface AssetMetadata {
  assets: AssetMetadataItem[];
}

const ASSETS_FOLDER_NAME = "assets";
const ASSET_METADATA_FILE_NAME = "assets.json";

export const loadReplayEventsDependencies =
  async (): Promise<ReplayEventsDependencies> => {
    const browserUserInteractions = await fetchAsset(
      "replay/v2/snippet-user-interactions.bundle.js"
    );
    const browserPlayback = await fetchAsset(
      "replay/v2/snippet-playback.bundle.js"
    );
    const browserUrlObserver = await fetchAsset(
      "replay/v2/snippet-url-observer.bundle.js"
    );
    const nodeBrowserContext = await fetchAsset(
      "replay/v2/node-browser-context.bundle.js"
    );
    const nodeNetworkStubbing = await fetchAsset(
      "replay/v2/node-network-stubbing.bundle.js"
    );
    const nodeUserInteractions = await fetchAsset(
      "replay/v2/node-user-interactions.bundle.js"
    );

    return {
      browserUserInteractions: {
        key: "browserUserInteractions",
        location: browserUserInteractions,
      },
      browserPlayback: {
        key: "browserPlayback",
        location: browserPlayback,
      },
      browserUrlObserver: {
        key: "browserUrlObserver",
        location: browserUrlObserver,
      },
      nodeBrowserContext: {
        key: "nodeBrowserContext",
        location: nodeBrowserContext,
      },
      nodeNetworkStubbing: {
        key: "nodeNetworkStubbing",
        location: nodeNetworkStubbing,
      },
      nodeUserInteractions: {
        key: "nodeUserInteractions",
        location: nodeUserInteractions,
      },
    };
  };

export const fetchAsset: (path: string) => Promise<string> = async (path) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const fetchUrl = new URL(path, getSnippetsBaseUrl()).href;
  const assetFileName = basename(new URL(fetchUrl).pathname);

  const assetMetadata = await loadAssetMetadata();
  const etag = (await axios.head(fetchUrl)).headers["etag"] || "";

  const entry = assetMetadata.assets.find(
    (item) => item.fileName === assetFileName
  );
  const filePath = join(await getOrCreateAssetsDir(), assetFileName);

  if (entry && etag !== "" && etag === entry.etag) {
    logger.debug(`${fetchUrl} already present`);
    return filePath;
  }

  const contents = (await axios.get(fetchUrl)).data;
  await writeFile(filePath, contents);
  if (entry) {
    logger.debug(`${fetchUrl} updated`);
    entry.etag = etag;
  } else {
    logger.debug(`${fetchUrl} downloaded`);
    assetMetadata.assets.push({ fileName: assetFileName, etag, fetchUrl });
  }
  await saveAssetMetadata(assetMetadata);
  return filePath;
};

const getOrCreateAssetsDir: () => Promise<string> = async () => {
  const assetsDir = join(getMeticulousLocalDataDir(), ASSETS_FOLDER_NAME);
  await mkdir(assetsDir, { recursive: true });
  return assetsDir;
};

const loadAssetMetadata: () => Promise<AssetMetadata> = async () => {
  const assetsFile = join(
    await getOrCreateAssetsDir(),
    ASSET_METADATA_FILE_NAME
  );

  const existingMetadata = await readFile(assetsFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingMetadata) {
    return existingMetadata;
  }

  return { assets: [] };
};

const saveAssetMetadata: (
  assetMetadata: AssetMetadata
) => Promise<void> = async (assetMetadata) => {
  const assetsFile = join(
    await getOrCreateAssetsDir(),
    ASSET_METADATA_FILE_NAME
  );

  await writeFile(assetsFile, JSON.stringify(assetMetadata, null, 2));
};
