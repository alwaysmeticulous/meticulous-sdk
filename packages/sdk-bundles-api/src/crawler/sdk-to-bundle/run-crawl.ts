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
   * The URL to start crawling from, e.g. https://app.example.com
   */
  startUrl: string;

  /**
   * The maximum time in seconds to spend crawling. Time spent on a manual
   * login does not count towards this.
   */
  crawlingTimeoutSeconds: number;

  /**
   * The maximum number of sessions to record.
   */
  maxNumSessions: number;

  /**
   * If present the crawler pauses after opening the start URL in the browser,
   * calls this to let the user manually log in, and only starts crawling once
   * the returned promise resolves.
   */
  onReadyForManualLogin?: (() => Promise<void>) | undefined;

  logLevel: string | number;
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
}
