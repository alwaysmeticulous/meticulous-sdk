import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import type {
  RunCrawlBundleCapabilities,
  RunCrawlOptions,
  RunCrawlResult,
} from "@alwaysmeticulous/sdk-bundles-api";

const RUN_CRAWL_BUNDLE_PATH = "crawler/v1/run-crawl.bundle.js";

export interface RunCrawlBundle {
  runCrawl: (options: RunCrawlOptions) => Promise<RunCrawlResult>;
  /** Empty for a bundle that predates the capabilities export. */
  capabilities: RunCrawlBundleCapabilities;
}

/**
 * The bundle is always the latest one published to the CDN, so it can be older than
 * this CLI (e.g. after a bundle rollback) and must be checked for the options it knows.
 */
export const loadRunCrawlBundle = async (): Promise<RunCrawlBundle> => {
  const bundleLocation = await fetchAsset(RUN_CRAWL_BUNDLE_PATH);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bundle = (await require(bundleLocation)) as {
    runCrawl: RunCrawlBundle["runCrawl"];
    runCrawlCapabilities?: RunCrawlBundleCapabilities;
  };
  return {
    runCrawl: bundle.runCrawl,
    capabilities: bundle.runCrawlCapabilities ?? {},
  };
};
