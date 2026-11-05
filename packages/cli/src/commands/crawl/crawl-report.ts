import { writeFile } from "fs/promises";
import type { RunCrawlResult } from "@alwaysmeticulous/sdk-bundles-api";

export interface CrawlReport {
  sessionIds: string[];
  startUrls: string[];
  numSessions: number;
  uniqueUrlCount: number;
  /** `null` when the crawler bundle didn't report the URLs it visited. */
  loginWallDetected: boolean | null;
}

const LOGIN_PATH_PATTERN =
  /(^|[/#_.-])(log[-_]?in|sign[-_]?in|sign[-_]?on|sign[-_]?up|register|auth|authenticate|authorize|oauth2?|sso|forgot[-_]?password|reset[-_]?password)([/?#_.-]|$)/i;

export const buildCrawlReport = (
  { sessionIds, uniqueUrlCount, visitedUrls }: RunCrawlResult,
  startUrls: string[],
): CrawlReport => ({
  sessionIds,
  startUrls,
  numSessions: sessionIds.length,
  uniqueUrlCount,
  loginWallDetected:
    visitedUrls != null ? detectLoginWall(visitedUrls, startUrls) : null,
});

/**
 * True when every URL the crawl reached is a login, sign-up or SSO page, or on another
 * origin than the start URLs (e.g. a hosted identity provider): the crawler never got
 * past the login.
 */
export const detectLoginWall = (
  visitedUrls: string[],
  startUrls: string[],
): boolean => {
  const startOrigins = new Set(startUrls.map((url) => new URL(url).origin));
  const parsed = visitedUrls.flatMap((url) => {
    try {
      return [new URL(url)];
    } catch {
      return [];
    }
  });
  return (
    parsed.length > 0 &&
    parsed.every(
      (url) =>
        !startOrigins.has(url.origin) ||
        LOGIN_PATH_PATTERN.test(`${url.pathname}${url.hash}`),
    )
  );
};

export const writeCrawlReport = async (
  outputFile: string,
  report: CrawlReport,
): Promise<void> => {
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};
