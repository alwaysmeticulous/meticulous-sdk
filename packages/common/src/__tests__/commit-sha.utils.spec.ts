import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGitDiff } from "../commit-sha.utils";

/** Settings a developer may have that would change a plain `git diff`'s format. */
const USER_CONFIG: Array<[string, string]> = [
  ["diff.noprefix", "true"],
  ["diff.mnemonicPrefix", "true"],
  ["diff.relative", "true"],
  ["color.ui", "always"],
  ["core.quotePath", "true"],
];

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

describe("getGitDiff", () => {
  let repo: string;
  let baseSha: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "get-git-diff-"));
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    mkdirSync(join(repo, "pkg"));
    writeFileSync(join(repo, "pkg", "a.ts"), "one\ntwo\n");
    writeFileSync(join(repo, "root.ts"), "root\n");
    writeFileSync(join(repo, "ü.ts"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "base");
    baseSha = git(repo, "rev-parse", "HEAD");

    writeFileSync(join(repo, "pkg", "a.ts"), "one\nchanged\n");
    writeFileSync(join(repo, "root.ts"), "root changed\n");
    writeFileSync(join(repo, "ü.ts"), "y\n");
    for (const [key, value] of USER_CONFIG) {
      git(repo, "config", key, value);
    }
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("diffs in the format Meticulous parses, whatever the user's git config", async () => {
    const diff = await getGitDiff(baseSha, undefined, {
      cwd: join(repo, "pkg"),
    });

    expect(diff).toContain("diff --git a/pkg/a.ts b/pkg/a.ts");
    expect(diff).toContain("--- a/pkg/a.ts\n+++ b/pkg/a.ts");
    expect(diff).toContain("diff --git a/root.ts b/root.ts");
    expect(diff).toContain("diff --git a/ü.ts b/ü.ts");
    expect(diff).not.toContain("\u001b[");
    expect(diff.endsWith("\n")).toBe(true);
  });

  it("diffs a submodule bump as a file section, even with diff.submodule=log", async () => {
    git(repo, "config", "diff.submodule", "log");
    const commitSubmoduleAt = (submoduleSha: string): string => {
      git(
        repo,
        "update-index",
        "--add",
        "--cacheinfo",
        `160000,${submoduleSha},lib`,
      );
      git(repo, "commit", "-q", "-m", `lib at ${submoduleSha}`);
      return git(repo, "rev-parse", "HEAD");
    };
    const fromSha = commitSubmoduleAt("1".repeat(40));
    const toSha = commitSubmoduleAt("2".repeat(40));

    const diff = await getGitDiff(fromSha, toSha, { cwd: repo });

    expect(diff).toContain("diff --git a/lib b/lib");
    expect(diff).toContain(
      `-Subproject commit ${"1".repeat(40)}\n+Subproject commit ${"2".repeat(40)}`,
    );
  });
});
