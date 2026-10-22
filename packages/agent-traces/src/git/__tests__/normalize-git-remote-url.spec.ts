import { describe, expect, it } from "vitest";
import { normalizeGitRemoteUrl } from "../normalize-git-remote-url";

describe("normalizeGitRemoteUrl", () => {
  it.each([
    "git@github.com:acme/shop.git",
    "ssh://git@github.com/acme/shop.git",
    "ssh://git@GitHub.com:22/acme/shop",
    "https://github.com/acme/shop.git",
    "https://github.com/acme/shop/",
  ])("normalises %s", (url) => {
    expect(normalizeGitRemoteUrl(url)).toBe("github.com/acme/shop");
  });

  it("keeps nested group paths", () => {
    expect(normalizeGitRemoteUrl("git@gitlab.com:acme/platform/shop.git")).toBe(
      "gitlab.com/acme/platform/shop",
    );
  });

  it.each(["/srv/git/shop.git", "file:///srv/git/shop.git", "C:\\repos\\shop"])(
    "returns null for the local remote %s",
    (url) => {
      expect(normalizeGitRemoteUrl(url)).toBeNull();
    },
  );
});
