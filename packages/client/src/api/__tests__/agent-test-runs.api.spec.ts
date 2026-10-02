import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import { getTestRuns } from "../agent-test-runs.api";

describe("getTestRuns", () => {
  let client: { get: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  beforeEach(() => {
    client = {
      get: vi.fn().mockResolvedValue({ data: { testRuns: [] } }),
    };
  });

  it("sends no params when called with no options", async () => {
    await expect(getTestRuns(asClient())).resolves.toEqual({ testRuns: [] });

    expect(client.get).toHaveBeenCalledWith("agent/projects/test-runs", {
      params: {},
    });
  });

  it("maps every option to its query param", async () => {
    await getTestRuns(asClient(), {
      project: "my-org/my-proj",
      prNumber: "17",
      status: "Failure,Success",
      createdSince: "2026-06-01",
      createdUntil: "2026-06-10",
      latestPerPullRequest: true,
      withDiffsOnly: true,
      withCheckIssuesOnly: true,
      checkIds: "accessibility",
      includeBaseTestRunId: true,
      includeDiffCount: true,
      includeDurationSeconds: true,
      includeCheckIssueCounts: true,
      limit: 25,
      offset: 0,
    });

    expect(client.get).toHaveBeenCalledWith("agent/projects/test-runs", {
      params: {
        project: "my-org/my-proj",
        prNumber: "17",
        status: "Failure,Success",
        checkIds: "accessibility",
        createdSince: "2026-06-01",
        createdUntil: "2026-06-10",
        latestPerPullRequest: "true",
        withDiffsOnly: "true",
        withCheckIssuesOnly: "true",
        includeBaseTestRunId: "true",
        includeDiffCount: "true",
        includeDurationSeconds: "true",
        includeCheckIssueCounts: "true",
        limit: "25",
        offset: "0",
      },
    });
  });

  it("sends a boolean only when it is set", async () => {
    await getTestRuns(asClient(), {
      baseTestRuns: true,
      includeDurationSeconds: false,
    });

    expect(client.get).toHaveBeenCalledWith("agent/projects/test-runs", {
      params: { baseTestRuns: "true" },
    });
  });
});
