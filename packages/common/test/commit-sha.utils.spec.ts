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

  it("uses BITBUCKET_COMMIT on Bitbucket PR builds", async () => {
    process.env.BITBUCKET_PR_ID = "42";
    process.env.BITBUCKET_COMMIT = "abc123source";

    const { getCommitSha } = await import("../src/commit-sha.utils");

    await expect(getCommitSha(undefined)).resolves.toBe("abc123source");
    expect(execMock).not.toHaveBeenCalled();
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

  it("prefers an explicit commitSha over Bitbucket CI env vars", async () => {
    process.env.BITBUCKET_PR_ID = "42";
    process.env.BITBUCKET_COMMIT = "abc123source";

    const { getCommitSha } = await import("../src/commit-sha.utils");

    await expect(getCommitSha("explicit-sha")).resolves.toBe("explicit-sha");
    expect(execMock).not.toHaveBeenCalled();
  });
});

describe("getBitbucketPullRequestBaseShaFromCi", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns BITBUCKET_PR_DESTINATION_COMMIT on PR builds", async () => {
    process.env.BITBUCKET_PR_ID = "42";
    process.env.BITBUCKET_PR_DESTINATION_COMMIT = "def456dest";

    const { getBitbucketPullRequestBaseShaFromCi } = await import(
      "../src/commit-sha.utils"
    );

    expect(getBitbucketPullRequestBaseShaFromCi()).toBe("def456dest");
  });

  it("returns undefined when BITBUCKET_PR_ID is not set", async () => {
    delete process.env.BITBUCKET_PR_ID;
    process.env.BITBUCKET_PR_DESTINATION_COMMIT = "def456dest";

    const { getBitbucketPullRequestBaseShaFromCi } = await import(
      "../src/commit-sha.utils"
    );

    expect(getBitbucketPullRequestBaseShaFromCi()).toBeUndefined();
  });
});
