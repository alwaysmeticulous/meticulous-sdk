import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findCandidatePrs } from "../candidate-prs/find-candidate-prs";
import { toGitSince } from "../candidate-prs/read-git-history";
import { resolveRepoRoot } from "../shared/run-git";
import { emptyTrashInBackground } from "../worktree/discard-dirs";
import type * as DiscardDirs from "../worktree/discard-dirs";
import {
  createTryWorktree,
  removeAllTryWorktrees,
  removeTryWorktree,
} from "../worktree/worktrees";

vi.mock("../worktree/discard-dirs", async (importOriginal) => ({
  ...(await importOriginal<typeof DiscardDirs>()),
  emptyTrashInBackground: vi.fn(),
}));

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

const GITIGNORE = ".meticulous-try/\nnode_modules/\ndist/\n";

const makeRepo = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "try-git-")));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, ".gitignore"), GITIGNORE);
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
  it("creates, reuses, switches in place and removes detached worktrees", () => {
    const repo = makeRepo();
    const first = git(repo, "rev-parse", "HEAD");
    const second = writeAndCommit(repo, "src/A.tsx", "a", "A (#1)");

    const created = createTryWorktree({
      repoRoot: repo,
      sha: first,
      name: "pr-1-base",
    });
    expect(created).toMatchObject({
      reused: false,
      sha: first,
      previousSha: null,
      installInputsChanged: null,
    });
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
    expect(moved).toMatchObject({
      reused: true,
      sha: second,
      previousSha: first,
      installInputsChanged: [],
    });
    expect(moved.path).toBe(created.path);
    expect(git(moved.path, "rev-parse", "HEAD")).toBe(second);

    expect(resolveRepoRoot(moved.path)).toBe(repo);
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");

    createTryWorktree({ repoRoot: repo, sha: second, name: "pr-1-head" });
    expect(
      removeTryWorktree({ repoRoot: repo, name: "pr-1-head" }).removed,
    ).toBe(true);
    expect(removeAllTryWorktrees(repo)).toEqual(["pr-1-base"]);
    expect(existsSync(moved.path)).toBe(false);
    expect(git(repo, "worktree", "list", "--porcelain")).not.toContain(
      ".meticulous-try",
    );
    expect(readdirSync(join(repo, ".meticulous-try", "trash")).sort()).toEqual([
      expect.stringMatching(/^pr-1-base-/),
      expect.stringMatching(/^pr-1-head-/),
    ]);
    expect(vi.mocked(emptyTrashInBackground)).toHaveBeenCalledWith(repo);
  });

  it("keeps the install when switching, reports changed install inputs and cleans build output", () => {
    const repo = makeRepo();
    const base = git(repo, "rev-parse", "HEAD");
    const featureOnly = writeAndCommit(repo, "src/B.tsx", "b", "B (#2)");
    const lockfileBump = writeAndCommit(
      repo,
      "apps/web/pnpm-lock.yaml",
      "lockfileVersion: 9\n",
      "bump deps (#3)",
    );

    const worktree = createTryWorktree({
      repoRoot: repo,
      sha: base,
      name: "pr-2",
    });
    mkdirSync(join(worktree.path, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(worktree.path, "dist"), { recursive: true });
    writeFileSync(join(worktree.path, "dist", "index.html"), "base build");
    writeFileSync(join(worktree.path, ".gitignore"), "edited by a build step");
    writeFileSync(join(worktree.path, "src-added-by-fix.ts"), "untracked");

    const head = createTryWorktree({
      repoRoot: repo,
      sha: featureOnly,
      name: "pr-2",
      cleanPaths: ["dist"],
    });
    expect(head.installInputsChanged).toEqual([]);
    expect(existsSync(join(worktree.path, "node_modules", "pkg"))).toBe(true);
    expect(existsSync(join(worktree.path, "dist"))).toBe(false);
    expect(existsSync(join(worktree.path, "src-added-by-fix.ts"))).toBe(false);
    expect(readFileSync(join(worktree.path, ".gitignore"), "utf8")).toBe(
      GITIGNORE,
    );

    expect(
      createTryWorktree({ repoRoot: repo, sha: lockfileBump, name: "pr-2" })
        .installInputsChanged,
    ).toEqual(["apps/web/pnpm-lock.yaml"]);
  });

  it("refuses to clean the worktree itself or its .git", () => {
    const repo = makeRepo();
    for (const cleanPath of ["./", ".", ".git", "../escape"]) {
      expect(() =>
        createTryWorktree({
          repoRoot: repo,
          sha: "HEAD",
          name: "pr-3",
          cleanPaths: [cleanPath],
        }),
      ).toThrow(/Refusing/);
    }
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
