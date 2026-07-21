import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  DIFFS_SUMMARY_CLIENT_VERSION,
  getProjectJsCoverage,
  getTestRunDiffsSummary,
  getTestRunDiffsSummaryCounts,
  getTestRunJsCoverage,
  getSessions,
  TESTRUN_JS_COVERAGE_CLIENT_VERSION,
} from "../agent.api";

describe("getTestRunDiffsSummary", () => {
  let client: { get: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  const paramsFromLastCall = (): Record<string, string> =>
    client.get.mock.calls[0][1].params;

  beforeEach(() => {
    client = {
      get: vi.fn().mockResolvedValue({ data: { status: "complete" } }),
    };
  });

  it("always sends the client version, even with no options", async () => {
    await getTestRunDiffsSummary(asClient(), "tr-1");

    expect(client.get).toHaveBeenCalledWith(
      "agent/test-runs/tr-1/diffs-summary",
      {
        params: { clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION) },
      },
    );
  });

  it("omits the opt-in params when their options are unset", async () => {
    await getTestRunDiffsSummary(asClient(), "tr-1", {});

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
    });
  });

  it("maps each option to its query param", async () => {
    await getTestRunDiffsSummary(asClient(), "tr-1", {
      includeReplayIds: true,
      includeDomDiffIds: true,
      includeAllDiffs: true,
      orderByReplayDiffs: true,
      includeReviewDecisions: true,
      onlyUnreviewed: true,
    });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
      includeReplayIds: "true",
      includeDomDiffIds: "true",
      includeAllDiffs: "true",
      orderByReplayDiffs: "true",
      includeReviewDecisions: "true",
      onlyUnreviewed: "true",
    });
  });

  it("sends only the params for the options that are set", async () => {
    await getTestRunDiffsSummary(asClient(), "tr-1", {
      includeDomDiffIds: true,
    });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
      includeDomDiffIds: "true",
    });
  });

  it("maps retrigger: true to the retrigger param", async () => {
    await getTestRunDiffsSummary(asClient(), "tr-1", { retrigger: true });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
      retrigger: "true",
    });
  });

  it("omits the retrigger param when unset", async () => {
    await getTestRunDiffsSummary(asClient(), "tr-1", { retrigger: false });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
    });
  });
});

describe("getSessions", () => {
  let client: { get: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  beforeEach(() => {
    client = {
      get: vi.fn().mockResolvedValue({ data: { sessions: [] } }),
    };
  });

  it("sends no params when called with no options", async () => {
    await getSessions(asClient());

    expect(client.get).toHaveBeenCalledWith("agent/sessions", { params: {} });
  });

  it("maps project, filters, limit, and offset to query params", async () => {
    await getSessions(asClient(), {
      project: "my-org/my-proj",
      createdSince: "2026-06-01",
      createdUntil: "2026-06-10",
      recordedSince: "2026-07-01",
      recordedUntil: "2026-07-10",
      recordedBy: "a@b.com",
      excludeSyntheticSessions: true,
      visitedUrlFilter: "*/checkout*",
      includeStartUrl: true,
      includeAbandonedReason: true,
      limit: 25,
      offset: 50,
    });

    expect(client.get).toHaveBeenCalledWith("agent/sessions", {
      params: {
        project: "my-org/my-proj",
        createdSince: "2026-06-01",
        createdUntil: "2026-06-10",
        recordedSince: "2026-07-01",
        recordedUntil: "2026-07-10",
        recordedBy: "a@b.com",
        excludeSyntheticSessions: "true",
        visitedUrlFilter: "*/checkout*",
        includeStartUrl: "true",
        includeAbandonedReason: "true",
        limit: "25",
        offset: "50",
      },
    });
  });

  it("omits boolean flags when false", async () => {
    await getSessions(asClient(), {
      excludeSyntheticSessions: false,
      includeStartUrl: false,
      includeAbandonedReason: false,
    });

    expect(client.get).toHaveBeenCalledWith("agent/sessions", { params: {} });
  });

  it("returns the response data", async () => {
    const sessions = [
      {
        id: "session-1",
        createdAt: "2026-07-16T00:00:00.000Z",
        recordedAt: "2026-07-16T00:00:00.000Z",
        status: "original" as const,
        recordedBy: "a@b.com",
      },
    ];
    client.get.mockResolvedValue({ data: { sessions } });

    const result = await getSessions(asClient());

    expect(result).toEqual({ sessions });
  });
});

describe("getTestRunDiffsSummaryCounts", () => {
  it("GETs the counts endpoint and returns the data", async () => {
    const counts = {
      numReplays: 5,
      numDiffs: 2,
      numApproved: 1,
      numIgnored: 0,
      numRejected: 0,
      numUnreviewed: 1,
    };
    const client = { get: vi.fn().mockResolvedValue({ data: counts }) };
    const result = await getTestRunDiffsSummaryCounts(
      client as unknown as MeticulousClient,
      "tr-1",
    );
    expect(client.get).toHaveBeenCalledWith(
      "agent/test-runs/tr-1/diffs-summary/counts",
    );
    expect(result).toEqual(counts);
  });
});

describe("getTestRunJsCoverage", () => {
  let client: { get: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  const paramsFromLastCall = (): Record<string, string> =>
    client.get.mock.calls[0][1].params;

  beforeEach(() => {
    client = {
      get: vi.fn().mockResolvedValue({ data: { files: [] } }),
    };
  });

  it("omits unionTestRunIds when not given", async () => {
    await getTestRunJsCoverage(asClient(), "tr-1");

    expect(client.get).toHaveBeenCalledWith(
      "agent/test-runs/tr-1/js-coverage",
      {
        params: {
          clientVersion: String(TESTRUN_JS_COVERAGE_CLIENT_VERSION),
          includeExecutedRanges: "true",
        },
      },
    );
  });

  it("forwards unionTestRunIds as a comma-joined list", async () => {
    await getTestRunJsCoverage(asClient(), "tr-1", {
      unionTestRunIds: ["tr-2", "tr-3"],
    });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(TESTRUN_JS_COVERAGE_CLIENT_VERSION),
      includeExecutedRanges: "true",
      unionTestRunIds: "tr-2,tr-3",
    });
  });

  it("omits unionTestRunIds when given an empty list", async () => {
    await getTestRunJsCoverage(asClient(), "tr-1", { unionTestRunIds: [] });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(TESTRUN_JS_COVERAGE_CLIENT_VERSION),
      includeExecutedRanges: "true",
    });
  });
});

describe("getProjectJsCoverage", () => {
  let client: { get: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  const paramsFromLastCall = (): Record<string, string> =>
    client.get.mock.calls[0][1].params;

  beforeEach(() => {
    client = {
      get: vi
        .fn()
        .mockResolvedValue({ data: { testRunId: "tr-1", files: [] } }),
    };
  });

  it("hits the project endpoint and defaults to executed ranges", async () => {
    await getProjectJsCoverage(asClient());

    expect(client.get).toHaveBeenCalledWith("agent/projects/js-coverage", {
      params: {
        clientVersion: String(TESTRUN_JS_COVERAGE_CLIENT_VERSION),
        includeExecutedRanges: "true",
      },
    });
  });

  it("forwards the project override, glob and only the requested columns", async () => {
    await getProjectJsCoverage(asClient(), {
      project: "org/project",
      globFilter: "src/**",
      includeCoveragePercentage: true,
    });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(TESTRUN_JS_COVERAGE_CLIENT_VERSION),
      project: "org/project",
      globFilter: "src/**",
      includeCoveragePercentage: "true",
    });
  });

  it("returns the resolved testRunId and files", async () => {
    client.get.mockResolvedValue({
      data: { testRunId: "tr-9", files: [{ repoFilePath: "a.ts" }] },
    });

    const result = await getProjectJsCoverage(asClient());

    expect(result).toEqual({
      testRunId: "tr-9",
      files: [{ repoFilePath: "a.ts" }],
    });
  });
});
