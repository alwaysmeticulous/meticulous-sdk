import { beforeEach, describe, expect, test, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getCommitSha: vi.fn(),
  getLocalBaseSha: vi.fn(),
  hasUncommittedChanges: vi.fn(),
  getStashCreateSha: vi.fn(),
  getUntrackedFiles: vi.fn(),
  getGitDiff: vi.fn(),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
}));

import {
  getCommitSha,
  getGitDiff,
  getLocalBaseSha,
  getStashCreateSha,
  getUntrackedFiles,
  hasUncommittedChanges,
} from "@alwaysmeticulous/common";
import {
  resolveBuildCommitSha,
  resolveComparisonOptions,
  resolveHeadCommitShaForLookup,
} from "./build-git-options";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  // Default: no untracked files (individual tests override).
  vi.mocked(getUntrackedFiles).mockResolvedValue([]);
});

describe("resolveBuildCommitSha", () => {
  test("returns the explicit commit SHA without touching git", async () => {
    const result = await resolveBuildCommitSha({
      commitSha: "abc123",
      repoDirectory: undefined,
    });

    expect(result.commitSha).toBe("abc123");
    expect(result.source).toBe("provided");
    expect(hasUncommittedChanges).not.toHaveBeenCalled();
    expect(getCommitSha).not.toHaveBeenCalled();
  });

  test("uses HEAD when the working tree is clean", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");

    const result = await resolveBuildCommitSha({
      commitSha: undefined,
      repoDirectory: undefined,
    });

    expect(result.commitSha).toBe("headsha");
    expect(result.source).toBe("local");
    expect(getStashCreateSha).not.toHaveBeenCalled();
  });

  test("uses an ephemeral stash commit when the tree is dirty", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
    vi.mocked(getStashCreateSha).mockResolvedValue("stashsha");

    const result = await resolveBuildCommitSha({
      commitSha: undefined,
      repoDirectory: undefined,
    });

    expect(result.commitSha).toBe("stashsha");
    expect(result.source).toBe("local-ephemeral");
    expect(getCommitSha).not.toHaveBeenCalled();
  });

  test("throws when stash-create yields nothing on a dirty tree", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
    vi.mocked(getStashCreateSha).mockResolvedValue("");
    vi.mocked(getCommitSha).mockResolvedValue("headsha");

    // Must not silently register the build against clean HEAD (which would omit
    // the uncommitted changes) — fail fast instead.
    await expect(
      resolveBuildCommitSha({ commitSha: undefined, repoDirectory: undefined }),
    ).rejects.toThrow(CliUserError);
    expect(getCommitSha).not.toHaveBeenCalled();
  });

  test("throws when both --commitSha and --repoDirectory are given", async () => {
    await expect(
      resolveBuildCommitSha({ commitSha: "abc123", repoDirectory: "/repo" }),
    ).rejects.toThrow(CliUserError);
  });

  test("throws when no commit can be determined", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("");

    await expect(
      resolveBuildCommitSha({ commitSha: undefined, repoDirectory: undefined }),
    ).rejects.toThrow(CliUserError);
  });

  test("throws when untracked files are present (require git add)", async () => {
    vi.mocked(getUntrackedFiles).mockResolvedValue(["new-file.ts"]);

    await expect(
      resolveBuildCommitSha({ commitSha: undefined, repoDirectory: undefined }),
    ).rejects.toThrow(CliUserError);
  });

  test("does not check untracked files when an explicit commitSha is given", async () => {
    vi.mocked(getUntrackedFiles).mockResolvedValue(["new-file.ts"]);

    const result = await resolveBuildCommitSha({
      commitSha: "abc123",
      repoDirectory: undefined,
    });

    expect(result.commitSha).toBe("abc123");
    expect(result.source).toBe("provided");
    expect(getUntrackedFiles).not.toHaveBeenCalled();
  });
});

describe("resolveHeadCommitShaForLookup", () => {
  test("returns HEAD when the working tree is clean", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");

    const result = await resolveHeadCommitShaForLookup({
      repoDirectory: undefined,
    });

    expect(result).toBe("headsha");
    expect(getCommitSha).toHaveBeenCalledWith(undefined, { cwd: "." });
  });

  test("uses --repoDirectory as the cwd when given", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");

    await resolveHeadCommitShaForLookup({ repoDirectory: "/repo" });

    expect(hasUncommittedChanges).toHaveBeenCalledWith({ cwd: "/repo" });
    expect(getCommitSha).toHaveBeenCalledWith(undefined, { cwd: "/repo" });
  });

  test("throws on a dirty working tree instead of falling back to an ephemeral commit", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(true);

    await expect(
      resolveHeadCommitShaForLookup({ repoDirectory: undefined }),
    ).rejects.toThrow(CliUserError);
    expect(getStashCreateSha).not.toHaveBeenCalled();
    expect(getCommitSha).not.toHaveBeenCalled();
  });

  test("throws when no commit can be determined", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("");

    await expect(
      resolveHeadCommitShaForLookup({ repoDirectory: undefined }),
    ).rejects.toThrow(CliUserError);
  });
});

describe("resolveComparisonOptions", () => {
  test("throws when --repoDirectory is combined with --baseSha", async () => {
    await expect(
      resolveComparisonOptions({
        baseSha: "base",
        gitDiffOutput: undefined,
        repoDirectory: "/repo",
      }),
    ).rejects.toThrow(CliUserError);
  });

  test("throws when --gitDiffOutput is given without --baseSha", async () => {
    await expect(
      resolveComparisonOptions({
        baseSha: undefined,
        gitDiffOutput: "diff",
        repoDirectory: undefined,
      }),
    ).rejects.toThrow(CliUserError);
  });

  test("passes through explicit base/diff and leaves head undefined", async () => {
    const result = await resolveComparisonOptions({
      baseSha: "base",
      gitDiffOutput: "diff",
      repoDirectory: undefined,
    });

    expect(result).toEqual({
      baseSha: "base",
      gitDiffOutput: "diff",
      head: undefined,
      headIsEphemeral: false,
    });
    expect(getLocalBaseSha).not.toHaveBeenCalled();
  });

  test("infers base, head and diff from a clean repo", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    const result = await resolveComparisonOptions({
      baseSha: undefined,
      gitDiffOutput: undefined,
      repoDirectory: "/repo",
    });

    expect(result).toEqual({
      baseSha: "basesha",
      gitDiffOutput: "the-diff",
      head: "headsha",
      headIsEphemeral: false,
    });
    expect(getGitDiff).toHaveBeenCalledWith("basesha", "headsha", {
      cwd: "/repo",
    });
  });

  test("infers from the local repo (cwd) when no comparison inputs are given", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    const result = await resolveComparisonOptions({
      baseSha: undefined,
      gitDiffOutput: undefined,
      repoDirectory: undefined,
    });

    expect(result).toEqual({
      baseSha: "basesha",
      gitDiffOutput: "the-diff",
      head: "headsha",
      headIsEphemeral: false,
    });
    expect(getGitDiff).toHaveBeenCalledWith("basesha", "headsha", { cwd: "." });
  });

  test("uses a stash-create commit as head for a dirty repo", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
    vi.mocked(getStashCreateSha).mockResolvedValue("stashsha");
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    const result = await resolveComparisonOptions({
      baseSha: undefined,
      gitDiffOutput: undefined,
      repoDirectory: "/repo",
    });

    expect(result.head).toBe("stashsha");
    expect(result.headIsEphemeral).toBe(true);
    expect(getGitDiff).toHaveBeenCalledWith("basesha", "stashsha", {
      cwd: "/repo",
    });
  });

  test("throws when untracked files are present", async () => {
    vi.mocked(getUntrackedFiles).mockResolvedValue(["new-file.ts"]);

    await expect(
      resolveComparisonOptions({
        baseSha: undefined,
        gitDiffOutput: undefined,
        repoDirectory: "/repo",
      }),
    ).rejects.toThrow(CliUserError);
  });

  test("throws when the base cannot be determined from the repo", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("");

    await expect(
      resolveComparisonOptions({
        baseSha: undefined,
        gitDiffOutput: undefined,
        repoDirectory: "/repo",
      }),
    ).rejects.toThrow(CliUserError);
  });
});
