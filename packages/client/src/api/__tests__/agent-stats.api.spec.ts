import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  getTestRunEventStats,
  getProjectDailyStats,
  getTestRunStats,
} from "../agent-stats.api";

const get = vi.fn();
const client = { get } as unknown as MeticulousClient;

describe("agent stats API", () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: { data: [], pagination: {} } });
  });

  it.each([
    {
      name: "test run",
      endpoint: "test-runs",
      call: () =>
        getTestRunStats(client, {
          project: "org/project",
          testRunIds: "tr-1,tr-2",
          prNumbers: "123",
          commitShas: "abc",
          limit: 25,
          apiToken: "secret",
          json: true,
        } as Parameters<typeof getTestRunStats>[1]),
      params: {
        project: "org/project",
        testRunId: "tr-1,tr-2",
        prNumber: "123",
        commitSha: "abc",
        limit: "25",
      },
    },
    {
      name: "project daily",
      endpoint: "project-daily",
      call: () =>
        getProjectDailyStats(client, {
          since: "2026-08-01",
          until: "2026-09-01",
          offset: 5,
          apiToken: "secret",
          json: true,
        } as Parameters<typeof getProjectDailyStats>[1]),
      params: {
        since: "2026-08-01",
        until: "2026-09-01",
        offset: "5",
      },
    },
    {
      name: "event",
      endpoint: "test-run-events",
      call: () =>
        getTestRunEventStats(client, {
          eventTypes: "test_run_viewed,diff_rejected",
          cursor: "cursor",
          apiToken: "secret",
          json: true,
        } as Parameters<typeof getTestRunEventStats>[1]),
      params: {
        eventType: "test_run_viewed,diff_rejected",
        cursor: "cursor",
      },
    },
    // Every endpoint is pinned against the runtime-only fields, not just the
    // one the leak was first found on: `toParams` iterates a per-endpoint
    // allowlist, so a new endpoint gets no protection from the others' tests.
  ])("maps $name filters to REST query parameters", async (testCase) => {
    await testCase.call();

    expect(get).toHaveBeenCalledWith(`agent/stats/${testCase.endpoint}`, {
      params: testCase.params,
    });
  });
});
