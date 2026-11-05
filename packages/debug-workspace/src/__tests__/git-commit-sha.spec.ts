import { describe, expect, it } from "vitest";
import { isValidGitCommitSha } from "../git-commit-sha";

describe("isValidGitCommitSha", () => {
  it.each([
    "df7aad61870c8d6a1a64daa62f444256c78b7740",
    "DF7AAD61870C8D6A1A64DAA62F444256C78B7740",
    "df7aad6",
    "a".repeat(64),
  ])("accepts hex object id %s", (sha) => {
    expect(isValidGitCommitSha(sha)).toBe(true);
  });

  it.each([
    undefined,
    null,
    "",
    "df7aad",
    "a".repeat(65),
    "unknown",
    "df7aad61870c8d6a1a64daa62f444256c78b7740-unclean",
    "df7aad61870c8d6a1a64daa62f444256c78b7740;touch /tmp/x",
    "$(id)",
    "--output=/tmp/x",
    "df7aad61870c8d6a1a64daa62f444256c78b7740\n",
    " df7aad61870c8d6a1a64daa62f444256c78b7740",
  ])("rejects %j", (sha) => {
    expect(isValidGitCommitSha(sha)).toBe(false);
  });
});
