import { describe, expect, it } from "vitest";
import { getLastGitConfigValue, parseGitConfig } from "../parse-git-config";
import { stripUrlCredentials } from "../strip-url-credentials";

describe("parseGitConfig", () => {
  const config = `
# a comment
[core]
\trepositoryformatversion = 0
\tbare = false
[remote "origin"]
\turl = https://github.com/acme/shop.git ; trailing comment
\tfetch = +refs/heads/*:refs/remotes/origin/*
[User]
\tName = "Alice \\"Al\\" Smith"
\temail = alice@old.example
[branch.Main]
\tremote = origin
[user] email = alice@acme.example
[alias]
\tlg = log --oneline \\
--graph
[pull]
\trebase
`;
  const entries = parseGitConfig(config);

  it("reads sections, subsections and last-one-wins values", () => {
    expect(getLastGitConfigValue(entries, "remote", "origin", "url")).toBe(
      "https://github.com/acme/shop.git",
    );
    expect(getLastGitConfigValue(entries, "user", null, "email")).toBe(
      "alice@acme.example",
    );
    expect(
      getLastGitConfigValue(entries, "remote", "Origin", "url"),
    ).toBeNull();
  });

  it("handles quoting, escapes, legacy subsections, continuations and booleans", () => {
    expect(getLastGitConfigValue(entries, "user", null, "name")).toBe(
      'Alice "Al" Smith',
    );
    expect(getLastGitConfigValue(entries, "branch", "main", "remote")).toBe(
      "origin",
    );
    expect(getLastGitConfigValue(entries, "alias", null, "lg")).toBe(
      "log --oneline --graph",
    );
    expect(getLastGitConfigValue(entries, "pull", null, "rebase")).toBe("true");
  });
});

describe("stripUrlCredentials", () => {
  it.each([
    [
      "https://alice:ghp_secret@github.com/acme/shop.git",
      "https://github.com/acme/shop.git",
    ],
    [
      "https://x-access-token@github.com/acme/shop.git",
      "https://github.com/acme/shop.git",
    ],
    ["https://github.com/acme/shop.git", "https://github.com/acme/shop.git"],
    [
      "ssh://git:hunter2@github.com/acme/shop.git",
      "ssh://git@github.com/acme/shop.git",
    ],
    ["git@github.com:acme/shop.git", "git@github.com:acme/shop.git"],
  ])("%s -> %s", (input, expected) => {
    expect(stripUrlCredentials(input)).toBe(expected);
  });
});
