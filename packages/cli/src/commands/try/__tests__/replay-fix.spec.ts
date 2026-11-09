import { execFileSync } from "child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { applyReplayFix, saveReplayFix } from "../replay-fix/replay-fix";
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

const commitFile = (repo: string, path: string, content: string): string => {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), content);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", `edit ${path}`);
  return git(repo, "rev-parse", "HEAD");
};

const makeRepo = (): { repo: string; base: string; head: string } => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "try-replay-fix-")));
  dirs.push(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, ".gitignore"), ".meticulous-try/\n");
  const base = commitFile(repo, "src/app.ts", "export const app = 1;\n");
  const head = commitFile(repo, "src/other.ts", "export const other = 1;\n");
  return { repo, base, head };
};

describe("replay fix", () => {
  it("saves the given files as one commit and applies it uncommitted to an older commit", async () => {
    const { repo, base, head } = makeRepo();
    const fixTree = await createTryWorktree({
      repoRoot: repo,
      sha: head,
      name: "replay-fix",
    });
    writeFileSync(join(fixTree.path, "src/app.ts"), "export const app = 2;\n");
    writeFileSync(
      join(fixTree.path, "src/mock.ts"),
      "export const mock = true;\n",
    );
    writeFileSync(
      join(fixTree.path, "build-output.txt"),
      "not part of the fix",
    );

    const fix = saveReplayFix({
      repoRoot: repo,
      worktree: "replay-fix",
      paths: ["src/app.ts", "src/mock.ts"],
      message: "Disable the service worker for replays",
    });
    expect(fix).toMatchObject({
      parentSha: head,
      files: ["src/app.ts", "src/mock.ts"],
    });
    expect(git(repo, "branch", "--list")).toBe("* main");
    expect(git(repo, "rev-parse", "main")).toBe(head);

    const backtest = await createTryWorktree({
      repoRoot: repo,
      sha: base,
      name: "pr-1",
    });
    expect(applyReplayFix({ repoRoot: repo, worktree: "pr-1" })).toMatchObject({
      applied: true,
      commitSha: fix.commitSha,
    });
    expect(readFileSync(join(backtest.path, "src/app.ts"), "utf8")).toBe(
      "export const app = 2;\n",
    );
    expect(git(backtest.path, "rev-parse", "HEAD")).toBe(base);
  });

  it("folds a second save into a single commit on the original parent", async () => {
    const { repo, head } = makeRepo();
    const fixTree = await createTryWorktree({
      repoRoot: repo,
      sha: head,
      name: "replay-fix",
    });
    writeFileSync(join(fixTree.path, "src/app.ts"), "export const app = 2;\n");
    saveReplayFix({
      repoRoot: repo,
      worktree: "replay-fix",
      paths: ["src/app.ts"],
      message: "first",
    });
    writeFileSync(
      join(fixTree.path, "src/other.ts"),
      "export const other = 2;\n",
    );

    const second = saveReplayFix({
      repoRoot: repo,
      worktree: "replay-fix",
      paths: ["src/other.ts"],
      message: "first and second",
    });

    expect(second.parentSha).toBe(head);
    expect(second.files).toEqual(["src/app.ts", "src/other.ts"]);
    expect(git(repo, "rev-parse", `${second.commitSha}^`)).toBe(head);
  });

  it("reports a conflict, keeping the worktree and its other uncommitted edits unchanged", async () => {
    const { repo, head } = makeRepo();
    const fixTree = await createTryWorktree({
      repoRoot: repo,
      sha: head,
      name: "replay-fix",
    });
    writeFileSync(join(fixTree.path, "src/app.ts"), "export const app = 2;\n");
    saveReplayFix({
      repoRoot: repo,
      worktree: "replay-fix",
      paths: ["src/app.ts"],
      message: "fix",
    });
    const later = commitFile(repo, "src/app.ts", "export const app = 3;\n");
    const backtest = await createTryWorktree({
      repoRoot: repo,
      sha: later,
      name: "pr-2",
    });
    writeFileSync(
      join(backtest.path, "src/other.ts"),
      "edited by a build step\n",
    );

    expect(applyReplayFix({ repoRoot: repo, worktree: "pr-2" })).toMatchObject({
      applied: false,
      reason: "conflict",
      conflicts: ["src/app.ts"],
    });
    expect(git(backtest.path, "status", "--porcelain")).toBe("M src/other.ts");
    expect(readFileSync(join(backtest.path, "src/app.ts"), "utf8")).toBe(
      "export const app = 3;\n",
    );
  });

  it("keeps other uncommitted edits when applying, and treats a second apply as done", async () => {
    const { repo, base, head } = makeRepo();
    const fixTree = await createTryWorktree({
      repoRoot: repo,
      sha: head,
      name: "replay-fix",
    });
    writeFileSync(join(fixTree.path, "src/app.ts"), "export const app = 2;\n");
    saveReplayFix({
      repoRoot: repo,
      worktree: "replay-fix",
      paths: ["src/app.ts"],
      message: "fix",
    });
    const backtest = await createTryWorktree({
      repoRoot: repo,
      sha: base,
      name: "pr-4",
    });
    writeFileSync(
      join(backtest.path, ".gitignore"),
      "edited by a build step\n",
    );

    expect(applyReplayFix({ repoRoot: repo, worktree: "pr-4" }).applied).toBe(
      true,
    );
    expect(applyReplayFix({ repoRoot: repo, worktree: "pr-4" }).applied).toBe(
      true,
    );
    expect(readFileSync(join(backtest.path, ".gitignore"), "utf8")).toBe(
      "edited by a build step\n",
    );
    expect(readFileSync(join(backtest.path, "src/app.ts"), "utf8")).toBe(
      "export const app = 2;\n",
    );
  });

  it("applies a fix that adds a file to both base and head of one worktree", async () => {
    const { repo, base, head } = makeRepo();
    const fixTree = await createTryWorktree({
      repoRoot: repo,
      sha: head,
      name: "replay-fix",
    });
    writeFileSync(join(fixTree.path, "src/app.ts"), "export const app = 2;\n");
    writeFileSync(
      join(fixTree.path, "src/mock.ts"),
      "export const mock = true;\n",
    );
    saveReplayFix({
      repoRoot: repo,
      worktree: "replay-fix",
      paths: ["src/app.ts", "src/mock.ts"],
      message: "fix with a new file",
    });

    await createTryWorktree({ repoRoot: repo, sha: base, name: "pr-5" });
    expect(applyReplayFix({ repoRoot: repo, worktree: "pr-5" }).applied).toBe(
      true,
    );
    const switched = await createTryWorktree({
      repoRoot: repo,
      sha: head,
      name: "pr-5",
    });
    expect(applyReplayFix({ repoRoot: repo, worktree: "pr-5" }).applied).toBe(
      true,
    );
    expect(readFileSync(join(switched.path, "src/app.ts"), "utf8")).toBe(
      "export const app = 2;\n",
    );
    expect(readFileSync(join(switched.path, "src/mock.ts"), "utf8")).toBe(
      "export const mock = true;\n",
    );
  });

  it("does nothing when no fix was saved, and refuses an empty save", async () => {
    const { repo, head } = makeRepo();
    await createTryWorktree({ repoRoot: repo, sha: head, name: "pr-3" });
    expect(applyReplayFix({ repoRoot: repo, worktree: "pr-3" })).toEqual({
      applied: false,
      reason: "no-fix",
    });
    expect(() =>
      saveReplayFix({
        repoRoot: repo,
        worktree: "pr-3",
        paths: ["src/app.ts"],
        message: "x",
      }),
    ).toThrow(/Nothing to save/);
  });
});
