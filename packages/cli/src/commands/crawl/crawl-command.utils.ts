import { initLogger } from "@alwaysmeticulous/common";
import type { CrawlStorageToSeed } from "@alwaysmeticulous/sdk-bundles-api";
import type { CrawlReport } from "./crawl-report";
import { loadStorageState, StorageStateError } from "./load-storage-state";

/**
 * Drops duplicates, which would otherwise each burn part of the crawling budget,
 * and rejects anything that isn't a URL up front rather than several minutes into
 * a crawl.
 */
export const parseStartUrls = (startUrls: string[]): string[] => {
  const logger = initLogger();
  const valid = startUrls.filter((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      logger.error(`Skipping '${url}': not a valid URL.`);
      return false;
    }
  });
  return [...new Set(valid)];
};

export const loadStorageToSeed = async (
  storageState: string | null | undefined,
  firstStartUrl: string,
): Promise<CrawlStorageToSeed | undefined> => {
  if (!storageState) {
    return undefined;
  }
  try {
    return await loadStorageState(storageState, firstStartUrl);
  } catch (error) {
    if (error instanceof StorageStateError) {
      initLogger().error(error.message);
      process.exit(1);
    }
    throw error;
  }
};

export const waitForEnter = (): Promise<void> => {
  const logger = initLogger();
  logger.info("");
  logger.info(
    "A browser window has opened at your start URL. If your app requires login, log in now.",
  );
  logger.info(
    "(warning: recording has already started, so the login will be part of the recorded session and may store credentials)",
  );
  logger.info("Once you're ready, press Enter here to start crawling...");
  return new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });
};

export const printSummary = (
  { numSessions, uniqueUrlCount, startUrls }: CrawlReport,
  outputFile: string | null | undefined,
): void => {
  const logger = initLogger();
  logger.info(
    `Recorded ${numSessions} sessions over ${uniqueUrlCount} unique URLs from ` +
      `${startUrls.length} start URL${startUrls.length === 1 ? "" : "s"}.`,
  );
  if (outputFile) {
    logger.info(`Wrote the crawl summary to ${outputFile}`);
  }
};

export const isLocalUrl = (url: string): boolean => {
  const { hostname } = new URL(url);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("127.")
  );
};
