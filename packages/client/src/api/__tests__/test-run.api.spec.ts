import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { FetchError } from "../../errors";
import type { MeticulousClient } from "../../types/client.types";
import { TEST_RUN_STATUS_CLIENT_VERSION } from "../test-run-status-client-version";
import {
  markTestRunExpectsCustomChecks,
  searchTestRuns,
} from "../test-run.api";

const fetchError = (status: number): FetchError => {
  const error = new Error(`HTTP ${status}`) as FetchError;
  error.response = {
    status,
    statusText: `status ${status}`,
    data: null,
    headers: {},
  };
  error.config = { url: "test-runs/tr-1/expect-custom-checks", method: "post" };
  return error;
};

describe("markTestRunExpectsCustomChecks", () => {
  let client: { post: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  beforeEach(() => {
    client = { post: vi.fn() };
  });

  it("posts to the expect-custom-checks endpoint for the test run", async () => {
    client.post.mockResolvedValue({ data: { expected: true } });

    await markTestRunExpectsCustomChecks({
      client: asClient(),
      testRunId: "tr-1",
    });

    expect(client.post).toHaveBeenCalledWith(
      "test-runs/tr-1/expect-custom-checks",
      {},
    );
  });

  it("no-ops on a 404 (older backend without the endpoint)", async () => {
    client.post.mockRejectedValue(fetchError(404));

    await expect(
      markTestRunExpectsCustomChecks({ client: asClient(), testRunId: "tr-1" }),
    ).resolves.toBeUndefined();
  });

  it("rethrows non-404 errors", async () => {
    client.post.mockRejectedValue(fetchError(500));

    await expect(
      markTestRunExpectsCustomChecks({ client: asClient(), testRunId: "tr-1" }),
    ).rejects.toThrow();
  });
});

describe("searchTestRuns", () => {
  let client: { post: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  beforeEach(() => {
    client = { post: vi.fn().mockResolvedValue({ data: [] }) };
  });

  it("posts the listing args to /test-runs/search as typed JSON", async () => {
    client.post.mockResolvedValue({ data: [{ id: "tr-1" }] });

    const result = await searchTestRuns({
      client: asClient(),
      projectId: "proj-1",
      offset: 0,
      limit: 20,
      prOnly: true,
      withDiffsOnly: false,
      completedWithoutExecutionErrorsOnly: true,
      searchQuery: "login",
      latestPerPullRequest: true,
    });

    expect(client.post).toHaveBeenCalledWith("test-runs/search", {
      projectId: "proj-1",
      offset: 0,
      limit: 20,
      prOnly: true,
      withDiffsOnly: false,
      completedWithoutExecutionErrorsOnly: true,
      searchQuery: "login",
      latestPerPullRequest: true,
      clientVersion: String(TEST_RUN_STATUS_CLIENT_VERSION),
    });
    expect(result).toEqual([{ id: "tr-1" }]);
  });

  it("omits projectId for token-pinned callers such as curate-diffs", async () => {
    await searchTestRuns({
      client: asClient(),
      offset: 0,
      limit: 10,
      prOnly: false,
      withDiffsOnly: false,
      completedWithoutExecutionErrorsOnly: false,
    });

    expect(client.post).toHaveBeenCalledWith("test-runs/search", {
      offset: 0,
      limit: 10,
      prOnly: false,
      withDiffsOnly: false,
      completedWithoutExecutionErrorsOnly: false,
      clientVersion: String(TEST_RUN_STATUS_CLIENT_VERSION),
    });
  });
});
