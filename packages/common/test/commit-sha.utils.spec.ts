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

  it("uses git rev-parse HEAD on Bitbucket PR builds", async () => {
    process.env.BITBUCKET_PR_ID = "42";
    process.env.BITBUCKET_COMMIT = "abc123source";

    execMock.mockImplementation(
      (_command, _options, callback: (error: null, output: string) => void) => {
        callback(null, "ephemeral-merge-sha\n");
      },
    );

    const { getCommitSha } = await import("../src/commit-sha.utils");

    await expect(getCommitSha(undefined)).resolves.toBe("ephemeral-merge-sha");
    expect(execMock).toHaveBeenCalledWith(
      "git rev-parse HEAD",
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("falls back to git rev-parse HEAD when not on a Bitbucket PR build", async () => {
    delete process.env.BITBUCKET_PR_ID;
    delete process.env.BITBUCKET_COMMIT;

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
    process.env.BITBUCKET_PR_ID = "42";
    process.env.BITBUCKET_COMMIT = "abc123source";

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

  it("prefers an explicit commitSha over git", async () => {
    process.env.BITBUCKET_PR_ID = "42";
    process.env.BITBUCKET_COMMIT = "abc123source";

    const { getCommitSha } = await import("../src/commit-sha.utils");

    await expect(getCommitSha("explicit-sha")).resolves.toBe("explicit-sha");
    expect(execMock).not.toHaveBeenCalled();
  });
});

describe("getBitbucketPullRequestHostingProviderIdFromCi", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns BITBUCKET_PR_ID when set", async () => {
    process.env.BITBUCKET_PR_ID = " 42 ";

    const { getBitbucketPullRequestHostingProviderIdFromCi } = await import(
      "../src/commit-sha.utils"
    );

    expect(getBitbucketPullRequestHostingProviderIdFromCi()).toBe("42");
  });

  it("returns undefined when BITBUCKET_PR_ID is not set", async () => {
    delete process.env.BITBUCKET_PR_ID;

    const { getBitbucketPullRequestHostingProviderIdFromCi } = await import(
      "../src/commit-sha.utils"
    );

    expect(getBitbucketPullRequestHostingProviderIdFromCi()).toBeUndefined();
  });
});
