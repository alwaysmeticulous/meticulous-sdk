import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import axios from "axios";
import { mkdir, readFile, writeFile } from "fs/promises";
import log from "loglevel";
import { basename, join } from "path";
import { getSnippetsBaseUrl } from "../config/snippets";

export interface AssetMetadataItem {
  fileName: string;
  etag: string;
  fetchUrl: string;
}

export interface AssetMetadata {
  assets: AssetMetadataItem[];
}

export const loadAssetMetadata: () => Promise<AssetMetadata> = async () => {
  const assetsDir = join(getMeticulousLocalDataDir(), "assets");
  await mkdir(assetsDir, { recursive: true });
  const assetsFile = join(assetsDir, `assets.json`);

  const existingMetadata = await readFile(assetsFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingMetadata) {
    return existingMetadata;
  }

  return { assets: [] };
};

export const saveAssetMetadata: (
  assetMetadata: AssetMetadata
) => Promise<void> = async (assetMetadata) => {
  const assetsDir = join(getMeticulousLocalDataDir(), "assets");
  await mkdir(assetsDir, { recursive: true });
  const assetsFile = join(assetsDir, `assets.json`);

  await writeFile(assetsFile, JSON.stringify(assetMetadata, null, 2));
};

export const fetchAsset: (path: string) => Promise<string> = async (path) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const fetchUrl = `${getSnippetsBaseUrl()}${path}`;

  const assetsDir = join(getMeticulousLocalDataDir(), "assets");

  const assetMetadata = await loadAssetMetadata();
  const etag = (await axios.head(fetchUrl)).headers["etag"] || "";

  const entry = assetMetadata.assets.find((item) => item.fetchUrl === fetchUrl);
  const fileName = entry
    ? entry.fileName
    : basename(new URL(fetchUrl).pathname);
  const filePath = join(assetsDir, fileName);

  if (entry && etag === entry.etag) {
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
    assetMetadata.assets.push({ fileName, etag, fetchUrl });
  }
  await saveAssetMetadata(assetMetadata);
  return filePath;
};
