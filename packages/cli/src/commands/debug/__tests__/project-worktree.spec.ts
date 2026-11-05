import { join } from "path";
import type { DebugContext } from "@alwaysmeticulous/debug-workspace";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync =
  vi.fn<(file: string, args: string[], options?: object) => string>();
const execSync = vi.fn<(command: string, options?: object) => string>();

vi.mock("child_process", () => ({
  execFileSync: (file: string, args: string[], options?: object) =>
    execFileSync(file, args, options),
  execSync: (command: string, options?: object) => execSync(command, options),
}));

import { createProjectWorktree } from "../project-worktree";

const GIT_ROOT = "/repo";
const WORKSPACE_DIR = "/workspace";
const VALID_SHA = "df7aad61870c8d6a1a64daa62f444256c78b7740";

const makeDebugContext = (commitSha: string | undefined): DebugContext =>
  ({ commitSha }) as DebugContext;

describe("createProjectWorktree", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    execFileSync.mockReset();
    execSync.mockReset();
    execFileSync.mockImplementation((_file: string, args: string[]) =>
      args[0] === "rev-parse" ? `${GIT_ROOT}\n` : "",
    );
  });

  it("invokes git without a shell, passing the SHA as a single argument", () => {
    const result = createProjectWorktree({
      debugContext: makeDebugContext(VALID_SHA),
      workspaceDir: WORKSPACE_DIR,
    });

    const projectRepoDir = join(WORKSPACE_DIR, "project-repo");
    expect(result).toBe(projectRepoDir);
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", VALID_SHA],
      expect.objectContaining({ cwd: GIT_ROOT }),
    );
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["worktree", "add", "--detach", projectRepoDir, VALID_SHA],
      expect.objectContaining({ cwd: GIT_ROOT }),
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it.each([
    `${VALID_SHA};touch /tmp/injected;#`,
    "$(touch /tmp/injected)",
    "--upload-pack=touch /tmp/injected",
    `${VALID_SHA}-unclean`,
    "unknown",
  ])("skips the worktree without running git on the SHA %j", (commitSha) => {
    const result = createProjectWorktree({
      debugContext: makeDebugContext(commitSha),
      workspaceDir: WORKSPACE_DIR,
    });

    expect(result).toBeUndefined();
    expect(execSync).not.toHaveBeenCalled();
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--show-toplevel"],
      expect.anything(),
    );
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
