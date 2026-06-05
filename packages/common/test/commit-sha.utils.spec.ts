import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  exec: execMock,
  execFile: vi.fn(),
}));

describe("getCommitSha", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    execMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("falls back to git rev-parse HEAD when commitSha is not provided", async () => {
    execMock.mockImplementation(
      (_command, _options, callback: (error: null, output: string) => void) => {
        callback(null, "local-head-sha\n");
      },
    );

    const { getCommitSha } = await import("../src/commit-sha.utils");

    await expect(getCommitSha(undefined)).resolves.toBe("local-head-sha");
    expect(execMock).toHaveBeenCalledWith(
      "git rev-parse HEAD",
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("uses git rev-parse in cwd when cwd is set", async () => {
    execMock.mockImplementation(
      (_command, options, callback: (error: null, output: string) => void) => {
        expect(options).toEqual({ encoding: "utf-8", cwd: "/cloned/repo" });
        callback(null, "cloned-head-sha\n");
      },
    );

    const { getCommitSha } = await import("../src/commit-sha.utils");

    await expect(
      getCommitSha(undefined, { cwd: "/cloned/repo" }),
    ).resolves.toBe("cloned-head-sha");
    expect(execMock).toHaveBeenCalledWith(
      "git rev-parse HEAD",
      { encoding: "utf-8", cwd: "/cloned/repo" },
      expect.any(Function),
    );
  });

  it("prefers an explicit commitSha over git rev-parse", async () => {
    const { getCommitSha } = await import("../src/commit-sha.utils");

    await expect(getCommitSha("explicit-sha")).resolves.toBe("explicit-sha");
    expect(execMock).not.toHaveBeenCalled();
  });
});
