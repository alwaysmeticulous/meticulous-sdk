import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyTrashInBackground, moveToTrash } from "../worktree/discard-dirs";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const makeRepo = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "try-trash-")));
  dirs.push(dir);
  return dir;
};

const makeTree = (root: string): string => {
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(root, "node_modules", "pkg", "index.js"), "x");
  return root;
};

describe("discard dirs", () => {
  it("moves a directory into the trash and deletes the trash in the background", async () => {
    const repo = makeRepo();
    const target = makeTree(join(repo, ".meticulous-try", "worktrees", "w1"));
    const stale = makeTree(join(repo, ".meticulous-try", "trash", "w0-stale"));

    expect(moveToTrash(repo, target)).toBe(true);
    expect(readdirSync(join(repo, ".meticulous-try", "worktrees"))).toEqual([]);
    expect(readdirSync(join(repo, ".meticulous-try", "trash"))).toHaveLength(2);

    emptyTrashInBackground(repo);

    await vi.waitFor(
      () => {
        expect(readdirSync(join(repo, ".meticulous-try", "trash"))).toEqual([]);
      },
      { timeout: 10_000, interval: 50 },
    );
  });

  it("reports when a directory cannot be moved", () => {
    const repo = makeRepo();
    expect(moveToTrash(repo, join(repo, "missing"))).toBe(false);
  });
});
