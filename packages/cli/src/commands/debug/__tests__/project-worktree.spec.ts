import type * as ChildProcess from "child_process";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DebugContext } from "@alwaysmeticulous/debug-workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync =
  vi.fn<(file: string, args: string[], options?: object) => string>();
const execSync = vi.fn<(command: string, options?: object) => string>();

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  execFileSync: (file: string, args: string[], options?: object) =>
    execFileSync(file, args, options),
  execSync: (command: string, options?: object) => execSync(command, options),
}));

import {
  createProjectWorktree,
  removeProjectWorktree,
} from "../project-worktree";

const GIT_ROOT = "/repo";
const WORKSPACE_DIR = "/workspace";
const VALID_SHA = "df7aad61870c8d6a1a64daa62f444256c78b7740";

const makeDebugContext = (commitSha: string | undefined): DebugContext =>
  ({ commitSha }) as DebugContext;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  execFileSync.mockReset();
  execSync.mockReset();
  execFileSync.mockImplementation((_file: string, args: string[]) =>
    args[0] === "rev-parse" ? `${GIT_ROOT}\n` : "",
  );
});

describe("createProjectWorktree", () => {
  it("invokes git without a shell, passing the SHA as a single argument", () => {
    const result = createProjectWorktree({
      debugContext: makeDebugContext(VALID_SHA),
      workspaceDir: WORKSPACE_DIR,
    });

    const projectRepoDir = join(WORKSPACE_DIR, "project-repo");
    expect(result).toBe(projectRepoDir);
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["fetch", "--end-of-options", "origin", VALID_SHA],
      expect.objectContaining({ cwd: GIT_ROOT }),
    );
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "--detach",
        "--end-of-options",
        projectRepoDir,
        VALID_SHA,
      ],
      expect.objectContaining({ cwd: GIT_ROOT }),
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it("skips the worktree when there is no commit SHA", () => {
    const result = createProjectWorktree({
      debugContext: makeDebugContext(undefined),
      workspaceDir: WORKSPACE_DIR,
    });

    expect(result).toBeUndefined();
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});

describe("removeProjectWorktree", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "project-worktree-spec-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("removes the worktree via git without a shell", () => {
    const projectRepoDir = join(workspaceDir, "project-repo");
    mkdirSync(projectRepoDir);

    removeProjectWorktree(workspaceDir);

    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["worktree", "remove", "--force", projectRepoDir],
      expect.objectContaining({ cwd: GIT_ROOT }),
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it("does nothing when there is no project repo worktree", () => {
    removeProjectWorktree(workspaceDir);

    expect(execFileSync).not.toHaveBeenCalled();
  });
});
