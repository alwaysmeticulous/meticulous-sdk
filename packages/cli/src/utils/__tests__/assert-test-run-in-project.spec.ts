import type { MeticulousClient } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import { assertTestRunInProjectOrThrow } from "../resolve-test-run-from-commit";

const mocks = vi.hoisted(() => ({
  assertTestRunInProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  assertTestRunInProject: mocks.assertTestRunInProject,
  getTestRun: vi.fn(),
  getTestRunForCommit: vi.fn(),
  getTestRunForPullRequest: vi.fn(),
  IN_PROGRESS_TEST_RUN_STATUS: [],
  TEST_RUN_PROJECT_MISMATCH_REASON: "project-mismatch",
  isFetchError: (error: unknown) =>
    (error as { isAxiosError?: boolean }).isAxiosError === true,
}));

const client = {} as MeticulousClient;

const fetchError = (data: unknown) =>
  Object.assign(new Error("Request failed with status code 400"), {
    isAxiosError: true,
    response: { status: 400, data },
  });

describe("assertTestRunInProjectOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips the check when no project was given", async () => {
    await assertTestRunInProjectOrThrow(client, "tr-1", undefined);

    expect(mocks.assertTestRunInProject).not.toHaveBeenCalled();
  });

  it("passes when the backend confirms the run's project", async () => {
    mocks.assertTestRunInProject.mockResolvedValue({
      projectId: "p-1",
      project: "org/proj",
    });

    await assertTestRunInProjectOrThrow(client, "tr-1", "proj");

    expect(mocks.assertTestRunInProject).toHaveBeenCalledWith(
      client,
      "tr-1",
      "proj",
    );
  });

  it("relays a mismatch as a user error with the backend's message", async () => {
    const message =
      "Test run tr-1 belongs to project org/proj, not org/other. Omit --project (--testRunId already determines it), or pass a test run from the project you meant.";
    mocks.assertTestRunInProject.mockRejectedValue(
      fetchError({ reason: "project-mismatch", message }),
    );

    const error = await assertTestRunInProjectOrThrow(
      client,
      "tr-1",
      "other",
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CliUserError);
    expect((error as Error).message).toBe(message);
  });

  it("rethrows any other failure unchanged", async () => {
    const failure = fetchError({ message: "Test run tr-1 not found" });
    mocks.assertTestRunInProject.mockRejectedValue(failure);

    await expect(
      assertTestRunInProjectOrThrow(client, "tr-1", "proj"),
    ).rejects.toBe(failure);
  });
});
