import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  DIFFS_SUMMARY_CLIENT_VERSION,
  getTestRunDiffsSummary,
  getTestRunDiffsSummaryCounts,
  getTestRunJsCoverage,
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
