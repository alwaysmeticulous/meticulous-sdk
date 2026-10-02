import type { MeticulousClient } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prNumberOption } from "../../commands/agent/pr-number-option";
import { CliUserError } from "../cli-user-error";
import { resolveTestRunOrThrow } from "../resolve-test-run-from-commit";

const mocks = vi.hoisted(() => ({
  getTestRunForCommit: vi.fn(),
  getTestRunForPullRequest: vi.fn(),
  getCommitSha: vi.fn(),
  appendProjectSelectionHint: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  getTestRun: vi.fn(),
  getTestRunForCommit: mocks.getTestRunForCommit,
  getTestRunForPullRequest: mocks.getTestRunForPullRequest,
  IN_PROGRESS_TEST_RUN_STATUS: [],
}));

vi.mock("@alwaysmeticulous/common", () => ({
  getCommitSha: mocks.getCommitSha,
  getUntrackedFiles: vi.fn().mockResolvedValue([]),
  hasUncommittedChanges: vi.fn().mockResolvedValue(false),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
}));

vi.mock("../project-selection-hint", () => ({
  appendProjectSelectionHint: mocks.appendProjectSelectionHint,
}));

const client = {} as MeticulousClient;

describe("resolveTestRunOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendProjectSelectionHint.mockImplementation((message: string) =>
      Promise.resolve(`${message} (hint)`),
    );
  });

  it("looks up the pull request's latest run when prNumber is given", async () => {
    mocks.getTestRunForPullRequest.mockResolvedValue({
      testRunId: "tr-pr",
      status: "Running",
    });

    const resolved = await resolveTestRunOrThrow(client, {
      commitSha: undefined,
      prNumber: 42,
      project: "org/proj",
    });

    expect(resolved).toEqual({ testRunId: "tr-pr", status: "Running" });
    expect(mocks.getTestRunForPullRequest).toHaveBeenCalledWith(client, 42, {
      project: "org/proj",
    });
    expect(mocks.getCommitSha).not.toHaveBeenCalled();
    expect(mocks.getTestRunForCommit).not.toHaveBeenCalled();
  });

  it("names the pull request and the searched project when it has no run", async () => {
    mocks.getTestRunForPullRequest.mockResolvedValue({
      testRunId: null,
      status: null,
    });

    const resolving = resolveTestRunOrThrow(client, {
      commitSha: undefined,
      prNumber: 42,
      project: undefined,
    });

    await expect(resolving).rejects.toThrow(CliUserError);
    await expect(resolving).rejects.toThrow(
      "No test run found for pull request 42. (hint)",
    );
  });

  it("falls back to the commit lookup without a prNumber", async () => {
    mocks.getCommitSha.mockResolvedValue("abc123");
    mocks.getTestRunForCommit.mockResolvedValue({
      testRunId: "tr-commit",
      status: "Success",
    });

    const resolved = await resolveTestRunOrThrow(client, {
      commitSha: "abc123",
      prNumber: undefined,
      project: undefined,
    });

    expect(resolved).toEqual({ testRunId: "tr-commit", status: "Success" });
    expect(mocks.getTestRunForPullRequest).not.toHaveBeenCalled();
  });
});

describe("prNumberOption", () => {
  it.each([0, -1, 4.2, Number.NaN])("rejects %s", (value) => {
    expect(() => prNumberOption().coerce(value)).toThrow(/positive integer/);
  });

  it("accepts a positive integer", () => {
    expect(prNumberOption().coerce(42)).toBe(42);
  });

  it("conflicts with the other run selectors", () => {
    expect(prNumberOption(["testRunIds"]).conflicts).toEqual([
      "testRunId",
      "commitSha",
      "testRunIds",
    ]);
  });
});
