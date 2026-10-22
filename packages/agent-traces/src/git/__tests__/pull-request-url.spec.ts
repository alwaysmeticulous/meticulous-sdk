import { describe, expect, it } from "vitest";
import { findPullRequestUrls, parsePullRequestUrl } from "../pull-request-url";

describe("parsePullRequestUrl", () => {
  it.each([
    ["https://github.com/Acme/Shop/pull/123", "github.com/acme/shop", 123],
    [
      "https://github.com/acme/shop/pull/123/files",
      "github.com/acme/shop",
      123,
    ],
    [
      "https://gitlab.com/acme/platform/shop/-/merge_requests/45",
      "gitlab.com/acme/platform/shop",
      45,
    ],
    [
      "https://gitlab.example.com:8443/acme/shop/merge_requests/7",
      "gitlab.example.com/acme/shop",
      7,
    ],
    [
      "https://bitbucket.org/acme/shop/pull-requests/9",
      "bitbucket.org/acme/shop",
      9,
    ],
  ])("parses %s", (url, repository, number) => {
    expect(parsePullRequestUrl(url)).toEqual({ repository, number });
  });

  it.each([
    "https://github.com/acme/shop/pull/new/feat/x",
    "https://github.com/acme/shop/issues/12",
    "https://github.com/acme/pull/12",
    "not a url",
  ])("rejects %s", (url) => {
    expect(parsePullRequestUrl(url)).toBeNull();
  });
});

describe("findPullRequestUrls", () => {
  it("finds every pull request URL in free text", () => {
    expect(
      findPullRequestUrls(
        "Opened https://github.com/acme/shop/pull/1 and see (https://github.com/acme/api/pull/22).",
      ),
    ).toEqual([
      { repository: "github.com/acme/shop", number: 1 },
      { repository: "github.com/acme/api", number: 22 },
    ]);
  });
});
