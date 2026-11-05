import { describe, expect, it } from "vitest";
import { buildCrawlReport, detectLoginWall } from "../crawl-report";

const START_URLS = ["http://localhost:3000/"];

describe("detectLoginWall", () => {
  it.each([
    [["http://localhost:3000/login"]],
    [["http://localhost:3000/login", "http://localhost:3000/sign-up"]],
    [["http://localhost:3000/auth/callback?x=1"]],
    [["http://localhost:3000/#/signin"]],
    [["http://localhost:3000/users/sign_in"]],
    [["https://example.auth0.com/u/login?state=abc"]],
  ])("detects a crawl that only reached login pages: %j", (visitedUrls) => {
    expect(detectLoginWall(visitedUrls, START_URLS)).toBe(true);
  });

  it.each([
    [[]],
    [["http://localhost:3000/"]],
    [["http://localhost:3000/login", "http://localhost:3000/dashboard"]],
    [["http://localhost:3000/authors"]],
    [["http://localhost:3000/blog/catalogue"]],
  ])("does not flag %j", (visitedUrls) => {
    expect(detectLoginWall(visitedUrls, START_URLS)).toBe(false);
  });
});

describe("buildCrawlReport", () => {
  it("summarises the crawl result", () => {
    expect(
      buildCrawlReport(
        {
          sessionIds: ["s1", "s2"],
          uniqueUrlCount: 2,
          visitedUrls: ["http://localhost:3000/", "http://localhost:3000/a"],
        },
        START_URLS,
      ),
    ).toEqual({
      sessionIds: ["s1", "s2"],
      startUrls: START_URLS,
      numSessions: 2,
      uniqueUrlCount: 2,
      loginWallDetected: false,
    });
  });

  it("reports an unknown login wall when the bundle doesn't return visited URLs", () => {
    expect(
      buildCrawlReport({ sessionIds: [], uniqueUrlCount: 0 }, START_URLS)
        .loginWallDetected,
    ).toBeNull();
  });
});
