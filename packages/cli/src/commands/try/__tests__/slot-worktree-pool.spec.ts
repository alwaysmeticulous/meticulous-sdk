import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orderFreeSlotsByAffinity } from "../slots/slot-worktrees";
import { prewarmSlotWorktrees } from "../worktree/prewarm";
import type * as DiscardDirs from "../worktree/discard-dirs";
import { snapshotBuildOutput } from "../worktree/snapshot-build";
import { createTryWorktree } from "../worktree/worktrees";

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

const makeRepo = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "try-pool-")));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(
    join(dir, ".gitignore"),
    ".meticulous-try/\nnode_modules/\ndist/\n",
  );
  writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
};

const commitFile = (
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

const writeNodeModules = (root: string, relative: string): void => {
  const dir = join(root, relative);
  mkdirSync(join(dir, "pkg"), { recursive: true });
  writeFileSync(join(dir, "pkg", "index.js"), "module.exports = 1;");
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("worktree node_modules seeding", () => {
  it("copies root and nested node_modules from the user's checkout, keeping symlinks, and skips the install", async () => {
    const repo = makeRepo();
    const appPackage = commitFile(
      repo,
      "apps/web/package.json",
      "{}",
      "app (#1)",
    );
    writeNodeModules(repo, "node_modules");
    symlinkSync(
      join("pkg", "index.js"),
      join(repo, "node_modules", "linked.js"),
    );
    writeNodeModules(repo, join("apps", "web", "node_modules"));

    const worktree = await createTryWorktree({
      repoRoot: repo,
      sha: appPackage,
      name: "slot-0",
    });

    expect(worktree.seededFrom).toEqual({ path: repo, sha: appPackage });
    expect(worktree.installInputsChanged).toEqual([]);
    expect(
      readFileSync(
        join(worktree.path, "node_modules", "pkg", "index.js"),
        "utf8",
      ),
    ).toBe("module.exports = 1;");
    expect(readlinkSync(join(worktree.path, "node_modules", "linked.js"))).toBe(
      join("pkg", "index.js"),
    );
    expect(
      existsSync(join(worktree.path, "apps", "web", "node_modules", "pkg")),
    ).toBe(true);
  });

  it("does not copy from a donor whose install inputs differ from the target commit", async () => {
    const repo = makeRepo();
    const before = git(repo, "rev-parse", "HEAD");
    writeNodeModules(repo, "node_modules");
    commitFile(repo, "pnpm-lock.yaml", "lockfileVersion: 10\n", "bump (#2)");

    const worktree = await createTryWorktree({
      repoRoot: repo,
      sha: before,
      name: "slot-0",
    });
    expect(worktree.seededFrom).toBeNull();
    expect(worktree.installInputsChanged).toBeNull();
    expect(existsSync(join(worktree.path, "node_modules"))).toBe(false);
  });

  it("does not copy from a donor whose install inputs are dirty", async () => {
    const repo = makeRepo();
    writeNodeModules(repo, "node_modules");
    writeFileSync(join(repo, "pnpm-lock.yaml"), "edited, uncommitted\n");

    const worktree = await createTryWorktree({
      repoRoot: repo,
      sha: "HEAD",
      name: "slot-0",
    });
    expect(worktree.seededFrom).toBeNull();
    expect(worktree.installInputsChanged).toBeNull();
    expect(existsSync(join(worktree.path, "node_modules"))).toBe(false);
  });

  it("prefers another try worktree as the donor over the user's checkout", async () => {
    const repo = makeRepo();
    const first = await createTryWorktree({
      repoRoot: repo,
      sha: "HEAD",
      name: "slot-0",
    });
    writeNodeModules(first.path, "node_modules");

    const second = await createTryWorktree({
      repoRoot: repo,
      sha: "HEAD",
      name: "slot-1",
    });
    expect(second.seededFrom?.path).toBe(first.path);
    expect(second.installInputsChanged).toEqual([]);
    expect(existsSync(join(second.path, "node_modules", "pkg"))).toBe(true);
  });

  it("never seeds from a slot worktree whose slot is held (its holder may be mid-install)", async () => {
    const repo = makeRepo();
    const first = await createTryWorktree({
      repoRoot: repo,
      sha: "HEAD",
      name: "slot-0",
    });
    writeNodeModules(first.path, "node_modules");
    const heldDir = join(repo, ".meticulous-try", "slots", "held");
    mkdirSync(heldDir, { recursive: true });
    writeFileSync(
      join(heldDir, "0.json"),
      JSON.stringify({ owner: "pr-9", rank: 1, acquiredAt: Date.now() }),
    );

    const second = await createTryWorktree({
      repoRoot: repo,
      sha: "HEAD",
      name: "slot-1",
    });
    expect(second.seededFrom).toBeNull();
    expect(second.installInputsChanged).toBeNull();

    // An expired lease no longer blocks seeding.
    writeFileSync(
      join(heldDir, "0.json"),
      JSON.stringify({ owner: "pr-9", rank: 1, acquiredAt: 0 }),
    );
    const third = await createTryWorktree({
      repoRoot: repo,
      sha: "HEAD",
      name: "slot-2",
    });
    expect(third.seededFrom?.path).toBe(first.path);
  });

  it("still needs an install when there is nothing to seed from", async () => {
    const repo = makeRepo();
    const worktree = await createTryWorktree({
      repoRoot: repo,
      sha: "HEAD",
      name: "slot-0",
    });
    expect(worktree.seededFrom).toBeNull();
    expect(worktree.installInputsChanged).toBeNull();
  });
});

describe("snapshotBuildOutput", () => {
  it("moves the build output out of the worktree and replaces an older snapshot", async () => {
    const repo = makeRepo();
    const sha = git(repo, "rev-parse", "HEAD");
    const worktree = await createTryWorktree({
      repoRoot: repo,
      sha,
      name: "slot-0",
    });
    mkdirSync(join(worktree.path, "dist"));
    writeFileSync(join(worktree.path, "dist", "index.html"), "first");

    const snapshot = snapshotBuildOutput({
      repoRoot: repo,
      worktreeName: "slot-0",
      sha,
      outputDir: "dist",
    });
    expect(snapshot.path).toBe(
      join(repo, ".meticulous-try", "builds", "outputs", sha),
    );
    expect(readFileSync(join(snapshot.path, "index.html"), "utf8")).toBe(
      "first",
    );
    expect(existsSync(join(worktree.path, "dist"))).toBe(false);

    mkdirSync(join(worktree.path, "dist"));
    writeFileSync(join(worktree.path, "dist", "index.html"), "second");
    const replaced = snapshotBuildOutput({
      repoRoot: repo,
      worktreeName: "slot-0",
      sha,
      outputDir: "dist",
    });
    expect(readFileSync(join(replaced.path, "index.html"), "utf8")).toBe(
      "second",
    );
  });

  it("defaults the output dir to the recipe's", async () => {
    const repo = makeRepo();
    const sha = git(repo, "rev-parse", "HEAD");
    const worktree = await createTryWorktree({
      repoRoot: repo,
      sha,
      name: "slot-0",
    });
    mkdirSync(join(worktree.path, "build"));
    writeFileSync(
      join(repo, ".meticulous-try", "build-recipe.json"),
      JSON.stringify({ kind: "static", outputDir: "build" }),
    );

    const snapshot = snapshotBuildOutput({
      repoRoot: repo,
      worktreeName: "slot-0",
      sha,
      outputDir: undefined,
    });
    expect(snapshot.outputDir).toBe("build");
    expect(existsSync(join(worktree.path, "build"))).toBe(false);
  });

  it("refuses a worktree at a different commit, missing output and unsafe paths", async () => {
    const repo = makeRepo();
    const first = git(repo, "rev-parse", "HEAD");
    const second = commitFile(repo, "src/A.tsx", "a", "A (#1)");
    const worktree = await createTryWorktree({
      repoRoot: repo,
      sha: first,
      name: "slot-0",
    });
    mkdirSync(join(worktree.path, "dist"));

    expect(() =>
      snapshotBuildOutput({
        repoRoot: repo,
        worktreeName: "slot-0",
        sha: second,
        outputDir: "dist",
      }),
    ).toThrow(/is at/);
    expect(() =>
      snapshotBuildOutput({
        repoRoot: repo,
        worktreeName: "slot-0",
        sha: first,
        outputDir: "missing",
      }),
    ).toThrow(/No build output/);
    expect(() =>
      snapshotBuildOutput({
        repoRoot: repo,
        worktreeName: "slot-0",
        sha: first,
        outputDir: ".git",
      }),
    ).toThrow(/Refusing/);
  });
});

describe("orderFreeSlotsByAffinity", () => {
  it("prefers the worktree closest to the commit, then any existing worktree, then empty slots", async () => {
    const repo = makeRepo();
    const first = git(repo, "rev-parse", "HEAD");
    commitFile(repo, "src/A.tsx", "a", "A (#1)");
    const third = commitFile(repo, "src/B.tsx", "b", "B (#2)");
    await createTryWorktree({ repoRoot: repo, sha: first, name: "slot-0" });
    await createTryWorktree({ repoRoot: repo, sha: third, name: "slot-1" });

    const order = orderFreeSlotsByAffinity({
      repoRoot: repo,
      targetSha: third,
    });
    expect(order([0, 1, 2])).toEqual([1, 0, 2]);

    const noTarget = orderFreeSlotsByAffinity({
      repoRoot: repo,
      targetSha: null,
    });
    expect(noTarget([2, 1, 0])).toEqual([0, 1, 2]);
  });
});

describe("prewarmSlotWorktrees", () => {
  it("creates missing slot worktrees in parallel, skipping existing worktrees and held slots", async () => {
    const repo = makeRepo();
    const sha = git(repo, "rev-parse", "HEAD");
    await createTryWorktree({ repoRoot: repo, sha, name: "slot-0" });
    const heldDir = join(repo, ".meticulous-try", "slots", "held");
    mkdirSync(heldDir, { recursive: true });
    writeFileSync(
      join(heldDir, "2.json"),
      JSON.stringify({ owner: "pr-1", rank: 1, acquiredAt: Date.now() }),
    );

    const results = await prewarmSlotWorktrees({
      repoRoot: repo,
      slotCount: 3,
      shas: [sha],
    });
    expect(results).toEqual([
      expect.objectContaining({ slot: 0, status: "already-exists" }),
      expect.objectContaining({ slot: 1, status: "created", sha }),
      expect.objectContaining({ slot: 2, status: "slot-held" }),
    ]);
    const worktrees = join(repo, ".meticulous-try", "worktrees");
    expect(existsSync(join(worktrees, "slot-1"))).toBe(true);
    expect(existsSync(join(worktrees, "slot-2"))).toBe(false);
    // The claim prewarm took on slot 1 was released; slot 2's holder stays.
    expect(readdirSync(heldDir)).toEqual(["2.json"]);

    const again = await prewarmSlotWorktrees({
      repoRoot: repo,
      slotCount: 3,
      shas: [sha],
    });
    expect(again.map((result) => result.status)).toEqual([
      "already-exists",
      "already-exists",
      "slot-held",
    ]);
  });
});
