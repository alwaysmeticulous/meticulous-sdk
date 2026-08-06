import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  DIFFS_SUMMARY_CLIENT_VERSION,
  getDiffComments,
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
      includeMismatchFraction: true,
      includeDomDiffIds: true,
      includeAllDiffs: true,
      orderByReplayDiffs: true,
      includeReviews: true,
      onlyUnreviewed: true,
      onlyRejected: true,
      onlyWithComments: true,
    });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
      includeReplayIds: "true",
      includeMismatchFraction: "true",
      includeDomDiffIds: "true",
      includeAllDiffs: "true",
      orderByReplayDiffs: "true",
      includeReviews: "true",
      onlyUnreviewed: "true",
      onlyRejected: "true",
      onlyWithComments: "true",
    });
  });

  it("maps the deprecated includeReviewDecisions option to includeReviews", async () => {
    await getTestRunDiffsSummary(asClient(), "tr-1", {
      includeReviewDecisions: true,
    });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
      includeReviews: "true",
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

  it("normalizes a legacy nested response from an older backend", async () => {
    client.get.mockResolvedValue({
      data: {
        status: "complete",
        data: [
          {
            replayDiffId: "rd-1",
            screenshots: [
              {
                screenshotName: "later",
                index: 2,
                outcome: "diff",
                userVisibleOutcome: "difference",
                mismatchFraction: 0.5,
              },
              {
                screenshotName: "first",
                index: 1,
                outcome: "diff",
                userVisibleOutcome: "difference",
                mismatchFraction: 0.25,
              },
            ],
          },
        ],
      },
    });

    await expect(getTestRunDiffsSummary(asClient(), "tr-1")).resolves.toEqual({
      status: "complete",
      data: [
        { replayDiffId: "rd-1", screenshotName: "first" },
        { replayDiffId: "rd-1", screenshotName: "later" },
      ],
    });
  });

  it("keeps mismatchFraction from an older backend when requested", async () => {
    client.get.mockResolvedValue({
      data: {
        status: "complete",
        data: [
          {
            replayDiffId: "rd-1",
            screenshots: [
              {
                screenshotName: "end-state",
                index: 1,
                outcome: "diff",
                userVisibleOutcome: "difference",
                mismatchFraction: 0.25,
              },
            ],
          },
        ],
      },
    });

    const result = await getTestRunDiffsSummary(asClient(), "tr-1", {
      includeMismatchFraction: true,
    });

    expect(result.data).toEqual([
      {
        replayDiffId: "rd-1",
        screenshotName: "end-state",
        mismatchFraction: 0.25,
      },
    ]);
  });

  it("preserves selection metadata and strips isSelected from current responses", async () => {
    client.get.mockResolvedValue({
      data: {
        status: "complete",
        selectionApplied: false,
        data: [
          {
            replayDiffId: "rd-1",
            screenshotName: "end-state",
            isSelected: true,
          },
        ],
      },
    });

    await expect(
      getTestRunDiffsSummary(asClient(), "tr-1", { includeAllDiffs: true }),
    ).resolves.toEqual({
      status: "complete",
      selectionApplied: false,
      data: [{ replayDiffId: "rd-1", screenshotName: "end-state" }],
    });
  });

  it("applies representative selection when talking to a v3 backend", async () => {
    client.get.mockResolvedValue({
      data: {
        status: "complete",
        data: Array.from({ length: 6 }, (_, index) => ({
          replayDiffId: "rd-1",
          screenshotName: `diff-${index}`,
          isSelected: index < 2,
        })),
      },
    });

    const result = await getTestRunDiffsSummary(asClient(), "tr-1");

    expect(result).toEqual({
      status: "complete",
      selectionApplied: true,
      data: [
        { replayDiffId: "rd-1", screenshotName: "diff-0" },
        { replayDiffId: "rd-1", screenshotName: "diff-1" },
      ],
    });
  });

  it("never re-caps an onlyRejected/onlyWithComments response from a v3 backend", async () => {
    const sixRows = Array.from({ length: 6 }, (_, index) => ({
      replayDiffId: "rd-1",
      screenshotName: `diff-${index}`,
      isSelected: index < 2,
    }));
    client.get.mockResolvedValue({
      data: { status: "complete", data: sixRows },
    });

    const result = await getTestRunDiffsSummary(asClient(), "tr-1", {
      onlyRejected: true,
    });

    expect(result.data).toHaveLength(6);
    expect(result.selectionApplied).toBeUndefined();
  });

  it("falls back to every matching row from a v3 backend when the isSelected intersection is empty", async () => {
    client.get.mockResolvedValue({
      data: {
        status: "complete",
        data: Array.from({ length: 6 }, (_, index) => ({
          replayDiffId: "rd-1",
          screenshotName: `diff-${index}`,
          isSelected: false,
        })),
      },
    });

    const result = await getTestRunDiffsSummary(asClient(), "tr-1", {
      onlyUnreviewed: true,
    });

    expect(result.data).toHaveLength(6);
    expect(result.selectionApplied).toBeUndefined();
  });

  it("does not report selectionApplied from a v3 backend when every match is already selected", async () => {
    client.get.mockResolvedValue({
      data: {
        status: "complete",
        data: Array.from({ length: 6 }, (_, index) => ({
          replayDiffId: "rd-1",
          screenshotName: `diff-${index}`,
          isSelected: true,
        })),
      },
    });

    const result = await getTestRunDiffsSummary(asClient(), "tr-1");

    expect(result.data).toHaveLength(6);
    expect(result.selectionApplied).toBeUndefined();
  });

  it("does not drop rows when isSelected is only present on some of them", async () => {
    client.get.mockResolvedValue({
      data: {
        status: "complete",
        data: [
          ...Array.from({ length: 5 }, (_, index) => ({
            replayDiffId: "rd-1",
            screenshotName: `selected-${index}`,
            isSelected: true,
          })),
          { replayDiffId: "rd-1", screenshotName: "no-isSelected-field" },
        ],
      },
    });

    const result = await getTestRunDiffsSummary(asClient(), "tr-1");

    expect(result.data).toHaveLength(6);
    expect(result.selectionApplied).toBeUndefined();
  });
});

describe("getDiffComments", () => {
  it("addresses a screenshot name safely", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ data: [{ id: "comment-1" }] }),
    };

    await expect(
      getDiffComments(
        client as unknown as MeticulousClient,
        "rd-1",
        "auxiliary-1-2-reason with spaces",
      ),
    ).resolves.toEqual([{ id: "comment-1" }]);
    expect(client.get).toHaveBeenCalledWith(
      "agent/replay-diffs/rd-1/screenshots/auxiliary-1-2-reason%20with%20spaces/comments",
      { params: {} },
    );
  });

  it("requests resolved comments only when explicitly included", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ data: [] }),
    };

    await getDiffComments(
      client as unknown as MeticulousClient,
      "rd-1",
      "end-state",
      { includeResolved: true },
    );

    expect(client.get).toHaveBeenCalledWith(
      "agent/replay-diffs/rd-1/screenshots/end-state/comments",
      { params: { includeResolved: "true" } },
    );
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
      numWithOpenComments: 0,
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
