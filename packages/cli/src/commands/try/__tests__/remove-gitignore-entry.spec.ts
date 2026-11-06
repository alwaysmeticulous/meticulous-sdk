import { execFileSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureGitignoreEntry } from "../../onboard/materialize-workspace";
import { TRY_GITIGNORE_COMMENT, TRY_WORKDIR } from "../shared/try-paths";
import {
  removeTryGitignoreEntry,
  withoutTryGitignoreEntry,
} from "../worktree/remove-gitignore-entry";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const makeRepo = (): string => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "try-gitignore-")));
  dirs.push(repo);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  return repo;
};

const addEntry = (repo: string): void =>
  ensureGitignoreEntry(repo, TRY_WORKDIR, TRY_GITIGNORE_COMMENT);

const readGitignore = (repo: string): string =>
  readFileSync(join(repo, ".gitignore"), "utf8");

describe("removeTryGitignoreEntry", () => {
  it("restores a .gitignore to what it was before try added its entry", () => {
    const repo = makeRepo();
    writeFileSync(join(repo, ".gitignore"), "node_modules\ndist\n");
    addEntry(repo);

    expect(removeTryGitignoreEntry(repo)).toBe(true);
    expect(readGitignore(repo)).toBe("node_modules\ndist\n");
  });

  it("restores a .gitignore that had no trailing newline", () => {
    const repo = makeRepo();
    writeFileSync(join(repo, ".gitignore"), "node_modules");
    addEntry(repo);

    removeTryGitignoreEntry(repo);

    expect(readGitignore(repo)).toBe("node_modules\n");
  });

  it("deletes a .gitignore that try created", () => {
    const repo = makeRepo();
    addEntry(repo);

    expect(removeTryGitignoreEntry(repo)).toBe(true);
    expect(existsSync(join(repo, ".gitignore"))).toBe(false);
  });

  it("keeps a tracked .gitignore that holds only the entry", () => {
    const repo = makeRepo();
    addEntry(repo);
    execFileSync("git", ["add", ".gitignore"], { cwd: repo });

    expect(removeTryGitignoreEntry(repo)).toBe(false);
    expect(readGitignore(repo)).toBe(".meticulous-try/\n");
  });

  it("keeps an entry the user added without try's comment", () => {
    const repo = makeRepo();
    writeFileSync(join(repo, ".gitignore"), "dist\n.meticulous-try/\n");

    expect(removeTryGitignoreEntry(repo)).toBe(false);
    expect(readGitignore(repo)).toBe("dist\n.meticulous-try/\n");
  });

  it("does nothing without a .gitignore", () => {
    expect(removeTryGitignoreEntry(makeRepo())).toBe(false);
  });
});

describe("withoutTryGitignoreEntry", () => {
  it("removes the entry from the middle of the file, keeping CRLF lines", () => {
    expect(
      withoutTryGitignoreEntry(
        "a\r\n\r\n# Meticulous try workspace\r\n.meticulous-try/\r\nb\r\n",
      ),
    ).toBe("a\r\nb\r\n");
  });
});
