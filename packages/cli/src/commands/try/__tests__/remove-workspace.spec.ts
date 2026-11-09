import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureGitignoreEntry } from "../../onboard/materialize-workspace";
import { TRY_GITIGNORE_COMMENT, TRY_WORKDIR } from "../shared/try-paths";
import { removeTryWorkspace } from "../worktree/remove-workspace";
import { createTryWorktree } from "../worktree/worktrees";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Dev",
      GIT_AUTHOR_EMAIL: "dev@example.com",
      GIT_COMMITTER_NAME: "Dev",
      GIT_COMMITTER_EMAIL: "dev@example.com",
    },
  }).trim();

const makeRepoWithWorkspace = (): string => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "try-workspace-")));
  dirs.push(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "hello\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  mkdirSync(join(repo, ".meticulous-try", "backtests"), { recursive: true });
  writeFileSync(join(repo, ".meticulous-try", ".gitignore"), "*\n");
  writeFileSync(join(repo, ".meticulous-try", "try-context.json"), "{}");
  return repo;
};

const deletingCopies = (repo: string): string[] =>
  readdirSync(repo).filter((name) =>
    name.startsWith(".meticulous-try-deleting-"),
  );

describe("removeTryWorkspace", () => {
  it("removes the workspace and its worktrees at once, deleting files in the background", async () => {
    const repo = makeRepoWithWorkspace();
    await createTryWorktree({ repoRoot: repo, sha: "HEAD", name: "pr-1-base" });
    await createTryWorktree({ repoRoot: repo, sha: "HEAD", name: "pr-1-head" });

    const result = removeTryWorkspace(repo);

    expect(result).toEqual({
      removed: true,
      worktrees: ["pr-1-base", "pr-1-head"],
      removedGitignoreEntry: false,
    });
    expect(existsSync(join(repo, ".meticulous-try"))).toBe(false);
    expect(git(repo, "worktree", "list", "--porcelain")).not.toContain(
      ".meticulous-try",
    );
    expect(git(repo, "status", "--porcelain")).toBe("");
    await vi.waitFor(
      () => {
        expect(deletingCopies(repo)).toEqual([]);
      },
      { timeout: 10_000, interval: 50 },
    );
  });

  it("keeps the renamed copy out of git status even without the workspace's own .gitignore", async () => {
    const repo = makeRepoWithWorkspace();
    rmSync(join(repo, ".meticulous-try", ".gitignore"));
    writeFileSync(join(repo, ".gitignore"), ".meticulous-try/\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "ignore workspace");
    await createTryWorktree({ repoRoot: repo, sha: "HEAD", name: "pr-1-base" });

    removeTryWorkspace(repo);

    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  it("removes the .gitignore entry try added, leaving git status as it was", async () => {
    const repo = makeRepoWithWorkspace();
    writeFileSync(join(repo, ".gitignore"), "dist\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "ignore dist");
    ensureGitignoreEntry(repo, TRY_WORKDIR, TRY_GITIGNORE_COMMENT);
    await createTryWorktree({ repoRoot: repo, sha: "HEAD", name: "pr-1-base" });

    expect(removeTryWorkspace(repo).removedGitignoreEntry).toBe(true);
    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toBe("dist\n");
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  it("reports nothing to remove and sweeps copies left by an interrupted run", async () => {
    const repo = makeRepoWithWorkspace();
    rmSync(join(repo, ".meticulous-try"), { recursive: true });
    mkdirSync(join(repo, ".meticulous-try-deleting-stale", "node_modules"), {
      recursive: true,
    });

    expect(removeTryWorkspace(repo)).toEqual({
      removed: false,
      worktrees: [],
      removedGitignoreEntry: false,
    });
    await vi.waitFor(
      () => {
        expect(deletingCopies(repo)).toEqual([]);
      },
      { timeout: 10_000, interval: 50 },
    );
  });
});
