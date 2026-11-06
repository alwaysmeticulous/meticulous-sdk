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
import { deleteInBackground } from "../worktree/discard-dirs";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

describe("deleteInBackground", () => {
  it("keeps a self-ignoring directory out of git status for the whole delete", () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), "try-delete-")));
    dirs.push(repo);
    git(repo, "init", "-q", "-b", "main");
    const doomed = join(repo, ".meticulous-try-deleting-test");
    mkdirSync(doomed);
    writeFileSync(join(doomed, ".gitignore"), "*\n");
    for (let dir = 0; dir < 100; dir++) {
      const path = join(doomed, "node_modules", `pkg${dir}`);
      mkdirSync(path, { recursive: true });
      for (let file = 0; file < 30; file++) {
        writeFileSync(join(path, `f${file}.js`), "x");
      }
    }

    deleteInBackground([doomed]);

    const statuses: string[] = [];
    const deadline = Date.now() + 15_000;
    while (existsSync(doomed) && Date.now() < deadline) {
      statuses.push(
        git(repo, "status", "--porcelain", "--untracked-files=all"),
      );
    }
    expect(existsSync(doomed)).toBe(false);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.filter((status) => status !== "")).toEqual([]);
  });
});
