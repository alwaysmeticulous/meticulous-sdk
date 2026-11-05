import type { Cookie, StorageEntry } from "@alwaysmeticulous/api";

/**
 * How the crawler spends its time on each page it reaches.
 *
 * - `default`: follow links outwards as soon as the page's clickables are
 *   exhausted, covering as many pages as the time budget allows.
 * - `depth`: exercise each page before moving on — scroll through it to render
 *   everything below the fold, and prefer the elements that keep us on the page
 *   (returning to it when a click does navigate away).
 */
export type CrawlExplorationMode = "default" | "depth";

export interface RunCrawlOptions {
  /**
   * The API token of the project to record sessions into. If not provided
   * it falls back to the METICULOUS_API_TOKEN environment variable or the
   * locally stored token.
   */
  apiToken?: string | null | undefined;

  /**
   * The id of the project to record sessions into. Required when the API
   * token is a user-scoped OAuth token (which isn't bound to a single
   * project); ignored for project-scoped API tokens.
   */
  projectId?: string | null | undefined;

  /**
   * The first URL to start crawling from, e.g. https://app.example.com
   *
   * Always the first entry of {@link startUrls}: it is kept as its own field so that
   * bundles predating that option still crawl when given a newer CLI's options.
   */
  startUrl: string;

  /**
   * The URLs to crawl, in the order they should be crawled. They share one browser,
   * so a single manual login covers all of them, and each is opened as a fresh page
   * load so that it records a session of its own.
   *
   * Optional so that a CLI predating this option, which sends only {@link startUrl},
   * keeps working.
   */
  startUrls?: string[] | undefined;

  /**
   * The maximum time in seconds to spend crawling, shared across all of
   * {@link startUrls}. Time spent on a manual login does not count towards this.
   */
  crawlingTimeoutSeconds: number;

  /**
   * The maximum number of sessions to record.
   */
  maxNumSessions: number;

  /**
   * How to explore each page reached by the crawl. Defaults to `default`.
   *
   * Optional so that a CLI predating this option keeps working.
   */
  explorationMode?: CrawlExplorationMode | undefined;

  /**
   * If present the crawler pauses after opening the start URL in the browser,
   * calls this to let the user manually log in, and only starts crawling once
   * the returned promise resolves.
   */
  onReadyForManualLogin?: (() => Promise<void>) | undefined;

  /**
   * Whether to run the browser headless. Defaults to `false`.
   *
   * Optional so that a CLI predating this option keeps working. A bundle predating it
   * ignores it and runs headed: check {@link RunCrawlBundleCapabilities.headless}.
   */
  headless?: boolean | undefined;

  /**
   * Cookies, local storage and session storage to seed into the browser before the
   * first start URL is loaded, e.g. to crawl signed-in pages without a manual login.
   * Only exposed to pages on the same origin as the first start URL.
   *
   * A bundle predating this option ignores it: check
   * {@link RunCrawlBundleCapabilities.storageToSeed}.
   */
  storageToSeed?: CrawlStorageToSeed | undefined;

  logLevel: string | number;
}

export interface CrawlStorageToSeed {
  cookies: Cookie[];
  localStorageEntries: StorageEntry[];
  sessionStorageEntries: StorageEntry[];
}

/**
 * Exported by the run-crawl bundle as `runCrawlCapabilities`, so that a CLI can tell
 * whether the bundle it loaded from the CDN understands an option before relying on
 * it. A bundle predating this export supports none of the options listed here.
 */
export interface RunCrawlBundleCapabilities {
  headless?: boolean;
  storageToSeed?: boolean;
  visitedUrls?: boolean;
}

export interface RunCrawlResult {
  /**
   * The ids of the sessions recorded during the crawl.
   */
  sessionIds: string[];

  /**
   * The number of unique URLs visited during the crawl.
   */
  uniqueUrlCount: number;

  /**
   * The unique URLs visited during the crawl, in the order first seen. Absent from
   * bundles predating it.
   */
  visitedUrls?: string[] | undefined;
}
