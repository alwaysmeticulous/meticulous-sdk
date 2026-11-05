import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { findCandidatePrs } from "../candidate-prs/find-candidate-prs";
import { toGitSince } from "../candidate-prs/read-git-history";
import { resolveRepoRoot } from "../shared/run-git";
import {
  createTryWorktree,
  removeAllTryWorktrees,
  removeTryWorktree,
} from "../worktree/worktrees";

const dirs: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Dev",
        GIT_AUTHOR_EMAIL: "dev@example.com",
        GIT_COMMITTER_NAME: "Dev",
        GIT_COMMITTER_EMAIL: "dev@example.com",
      },
    },
  ).trim();

const makeRepo = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "try-git-")));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, ".gitignore"), ".meticulous-try/\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
};

const writeAndCommit = (
  dir: string,
  path: string,
  content: string,
  message: string,
): string => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), content);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
};

const lines = (count: number, label: string): string =>
  Array.from(
    { length: count },
    (_, i) => `export const ${label}${i} = ${i};`,
  ).join("\n");

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("findCandidatePrs", () => {
  it("finds squash and true merges on the first-parent history with base/head shas", () => {
    const repo = makeRepo();
    const beforeSquash = git(repo, "rev-parse", "HEAD");
    const squash = writeAndCommit(
      repo,
      "src/Table.tsx",
      lines(50, "t"),
      "New table (#1)",
    );

    git(repo, "checkout", "-q", "-b", "feature");
    writeAndCommit(repo, "src/Nav.tsx", lines(60, "n"), "nav work");
    git(repo, "checkout", "-q", "main");
    git(
      repo,
      "merge",
      "-q",
      "--no-ff",
      "feature",
      "-m",
      "Merge pull request #2 from acme/feature\n\nRedesign nav",
    );
    const merge = git(repo, "rev-parse", "HEAD");

    writeAndCommit(
      repo,
      "src/Table.tsx",
      lines(52, "t"),
      "Fix table header (#3)",
    );

    const result = findCandidatePrs({
      repoRoot: repo,
      ref: undefined,
      since: "30d",
      appPath: ".",
      limit: 10,
      maxCommits: 100,
    });

    expect(result.ref).toBe("main");
    expect(result.mergedPrsFound).toBe(3);
    const byNumber = new Map(result.candidates.map((c) => [c.prNumber, c]));
    expect(byNumber.get(1)).toMatchObject({
      kind: "squash",
      baseSha: beforeSquash,
      headSha: squash,
    });
    expect(byNumber.get(2)).toMatchObject({
      kind: "merge",
      title: "Redesign nav",
      baseSha: squash,
      headSha: merge,
      frontendFiles: ["src/Nav.tsx"],
    });
    expect(byNumber.get(1)?.signals.followUpFixes).toHaveLength(1);
    expect(result.candidates[0].prNumber).toBe(1);
  });
});

describe("toGitSince", () => {
  it.each([
    ["90d", "90.days.ago"],
    ["12w", "12.weeks.ago"],
    ["6m", "6.months.ago"],
    ["2026-01-01", "2026-01-01"],
  ])("%s -> %s", (input, expected) => {
    expect(toGitSince(input)).toBe(expected);
  });
});

describe("try worktrees", () => {
  it("creates, reuses, recreates and removes detached worktrees", () => {
    const repo = makeRepo();
    const first = git(repo, "rev-parse", "HEAD");
    const second = writeAndCommit(repo, "src/A.tsx", "a", "A (#1)");

    const created = createTryWorktree({
      repoRoot: repo,
      sha: first,
      name: "pr-1-base",
    });
    expect(created).toMatchObject({ reused: false, sha: first });
    expect(created.path).toBe(
      join(repo, ".meticulous-try", "worktrees", "pr-1-base"),
    );
    expect(git(created.path, "rev-parse", "HEAD")).toBe(first);
    expect(
      createTryWorktree({ repoRoot: repo, sha: first, name: "pr-1-base" })
        .reused,
    ).toBe(true);

    const moved = createTryWorktree({
      repoRoot: repo,
      sha: second.slice(0, 10),
      name: "pr-1-base",
    });
    expect(moved).toMatchObject({ reused: false, sha: second });

    expect(resolveRepoRoot(moved.path)).toBe(repo);
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");

    createTryWorktree({ repoRoot: repo, sha: second, name: "pr-1-head" });
    expect(
      removeTryWorktree({ repoRoot: repo, name: "pr-1-head" }).removed,
    ).toBe(true);
    expect(removeAllTryWorktrees(repo)).toEqual(["pr-1-base"]);
    expect(existsSync(moved.path)).toBe(false);
  });

  it("rejects unsafe names and unknown commits", () => {
    const repo = makeRepo();
    expect(() =>
      createTryWorktree({ repoRoot: repo, sha: "HEAD", name: "../escape" }),
    ).toThrow(/Invalid worktree name/);
    expect(() =>
      createTryWorktree({ repoRoot: repo, sha: "deadbeef", name: "x" }),
    ).toThrow(/not found/);
    expect(() =>
      createTryWorktree({ repoRoot: repo, sha: "--help", name: "x" }),
    ).toThrow(/Invalid commit/);
  });
});
