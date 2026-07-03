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
    const result = await resolveBuildCommitSha({ commitSha: "abc123" });

    expect(result.commitSha).toBe("abc123");
    expect(result.source).toBe("provided");
    expect(hasUncommittedChanges).not.toHaveBeenCalled();
    expect(getCommitSha).not.toHaveBeenCalled();
  });

  test("uses HEAD when the working tree is clean", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");

    const result = await resolveBuildCommitSha({ commitSha: undefined });

    expect(result.commitSha).toBe("headsha");
    expect(result.source).toBe("local");
    expect(getStashCreateSha).not.toHaveBeenCalled();
  });

  test("uses an ephemeral stash commit when the tree is dirty", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
    vi.mocked(getStashCreateSha).mockResolvedValue("stashsha");

    const result = await resolveBuildCommitSha({ commitSha: undefined });

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
      resolveBuildCommitSha({ commitSha: undefined }),
    ).rejects.toThrow(CliUserError);
    expect(getCommitSha).not.toHaveBeenCalled();
  });

  test("throws when no commit can be determined", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("");

    await expect(
      resolveBuildCommitSha({ commitSha: undefined }),
    ).rejects.toThrow(CliUserError);
  });

  test("throws when untracked files are present (require git add)", async () => {
    vi.mocked(getUntrackedFiles).mockResolvedValue(["new-file.ts"]);

    await expect(
      resolveBuildCommitSha({ commitSha: undefined }),
    ).rejects.toThrow(CliUserError);
  });

  test("does not check untracked files when an explicit commitSha is given", async () => {
    vi.mocked(getUntrackedFiles).mockResolvedValue(["new-file.ts"]);

    const result = await resolveBuildCommitSha({ commitSha: "abc123" });

    expect(result.commitSha).toBe("abc123");
    expect(result.source).toBe("provided");
    expect(getUntrackedFiles).not.toHaveBeenCalled();
  });
});

describe("resolveHeadCommitShaForLookup", () => {
  test("returns HEAD when the working tree is clean", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");

    const result = await resolveHeadCommitShaForLookup();

    expect(result).toBe("headsha");
    expect(getCommitSha).toHaveBeenCalledWith(undefined, { cwd: "." });
  });

  test("throws on a dirty working tree instead of falling back to an ephemeral commit", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(true);

    await expect(resolveHeadCommitShaForLookup()).rejects.toThrow(CliUserError);
    expect(getStashCreateSha).not.toHaveBeenCalled();
    expect(getCommitSha).not.toHaveBeenCalled();
  });

  test("throws when no commit can be determined", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("");

    await expect(resolveHeadCommitShaForLookup()).rejects.toThrow(CliUserError);
  });
});

describe("resolveComparisonOptions", () => {
  test("throws when --gitDiffOutput is given without --baseSha", async () => {
    await expect(
      resolveComparisonOptions({
        baseSha: undefined,
        gitDiffOutput: "diff",
        commitSha: undefined,
      }),
    ).rejects.toThrow(CliUserError);
  });

  test("passes through an explicit diff as-is, regardless of commitSha", async () => {
    const result = await resolveComparisonOptions({
      baseSha: "base",
      gitDiffOutput: "diff",
      commitSha: "sha-1",
    });

    expect(result).toEqual({
      baseSha: "base",
      gitDiffOutput: "diff",
      head: undefined,
      headIsEphemeral: false,
    });
    expect(getLocalBaseSha).not.toHaveBeenCalled();
    expect(getGitDiff).not.toHaveBeenCalled();
  });

  test("--deploymentId mode: infers a diff against local HEAD when --baseSha is given (no commitSha)", async () => {
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    const result = await resolveComparisonOptions({
      baseSha: "base",
      gitDiffOutput: undefined,
      commitSha: undefined,
    });

    expect(result).toEqual({
      baseSha: "base",
      gitDiffOutput: "the-diff",
      head: "headsha",
      headIsEphemeral: false,
    });
    expect(getLocalBaseSha).not.toHaveBeenCalled();
    expect(getGitDiff).toHaveBeenCalledWith("base", "headsha", { cwd: "." });
  });

  test("--deploymentId mode: infers base, head and diff from a clean local repo when nothing is given", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(hasUncommittedChanges).mockResolvedValue(false);
    vi.mocked(getCommitSha).mockResolvedValue("headsha");
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    const result = await resolveComparisonOptions({
      baseSha: undefined,
      gitDiffOutput: undefined,
      commitSha: undefined,
    });

    expect(result).toEqual({
      baseSha: "basesha",
      gitDiffOutput: "the-diff",
      head: "headsha",
      headIsEphemeral: false,
    });
    expect(getGitDiff).toHaveBeenCalledWith("basesha", "headsha", { cwd: "." });
  });

  test("--deploymentId mode: uses a stash-create commit as head for a dirty repo", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
    vi.mocked(getStashCreateSha).mockResolvedValue("stashsha");
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    const result = await resolveComparisonOptions({
      baseSha: undefined,
      gitDiffOutput: undefined,
      commitSha: undefined,
    });

    expect(result.head).toBe("stashsha");
    expect(result.headIsEphemeral).toBe(true);
    expect(getGitDiff).toHaveBeenCalledWith("basesha", "stashsha", {
      cwd: ".",
    });
  });

  test("--deploymentId mode: throws when untracked files are present", async () => {
    vi.mocked(getUntrackedFiles).mockResolvedValue(["new-file.ts"]);

    await expect(
      resolveComparisonOptions({
        baseSha: undefined,
        gitDiffOutput: undefined,
        commitSha: undefined,
      }),
    ).rejects.toThrow(CliUserError);
  });

  test("throws when the base cannot be determined from the repo", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("");

    await expect(
      resolveComparisonOptions({
        baseSha: undefined,
        gitDiffOutput: undefined,
        commitSha: undefined,
      }),
    ).rejects.toThrow(CliUserError);
  });

  test("--commitSha mode: diffs against the given commitSha instead of local HEAD when --baseSha is given", async () => {
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    const result = await resolveComparisonOptions({
      baseSha: "base",
      gitDiffOutput: undefined,
      commitSha: "sha-1",
    });

    // This is the fix: a diff is inferred here even though commitSha (not
    // deploymentId) is in play — against the given commitSha, not local HEAD.
    expect(result).toEqual({
      baseSha: "base",
      gitDiffOutput: "the-diff",
      head: "sha-1",
      headIsEphemeral: false,
    });
    expect(getLocalBaseSha).not.toHaveBeenCalled();
    expect(getGitDiff).toHaveBeenCalledWith("base", "sha-1", { cwd: "." });
    // The commit is already resolved — no local HEAD/dirty-tree resolution.
    expect(hasUncommittedChanges).not.toHaveBeenCalled();
    expect(getCommitSha).not.toHaveBeenCalled();
    expect(getStashCreateSha).not.toHaveBeenCalled();
  });

  test("--commitSha mode: infers base from the local repo and diffs against the given commitSha when --baseSha is omitted", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    // This is the regression this fix addresses: previously, `--commitSha`
    // without `--baseSha` (explicit or the local-HEAD-inferred bare
    // invocation) always failed, because a diff was inferred unconditionally
    // and then rejected downstream for lacking a deploymentId to attach to.
    const result = await resolveComparisonOptions({
      baseSha: undefined,
      gitDiffOutput: undefined,
      commitSha: "sha-1",
    });

    expect(result).toEqual({
      baseSha: "basesha",
      gitDiffOutput: "the-diff",
      head: "sha-1",
      headIsEphemeral: false,
    });
    expect(getGitDiff).toHaveBeenCalledWith("basesha", "sha-1", { cwd: "." });
  });

  test("--commitSha mode: does not check untracked files or the working tree", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(getUntrackedFiles).mockResolvedValue(["new-file.ts"]);
    vi.mocked(getGitDiff).mockResolvedValue("the-diff");

    // Untracked/uncommitted local changes are irrelevant to a diff between two
    // already-resolved commits, unlike --deploymentId mode where head is
    // resolved fresh from the live working tree.
    await resolveComparisonOptions({
      baseSha: undefined,
      gitDiffOutput: undefined,
      commitSha: "sha-1",
    });

    expect(getUntrackedFiles).not.toHaveBeenCalled();
    expect(hasUncommittedChanges).not.toHaveBeenCalled();
  });

  test("wraps a getGitDiff failure (e.g. commitSha not in local history) in a CliUserError", async () => {
    vi.mocked(getLocalBaseSha).mockResolvedValue("basesha");
    vi.mocked(getGitDiff).mockRejectedValue(
      new Error("fatal: bad object sha-1"),
    );

    await expect(
      resolveComparisonOptions({
        baseSha: undefined,
        gitDiffOutput: undefined,
        commitSha: "sha-1",
      }),
    ).rejects.toThrow(CliUserError);
  });
});
