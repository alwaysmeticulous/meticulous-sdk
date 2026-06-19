import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  DIFFS_SUMMARY_CLIENT_VERSION,
  getTestRunDiffsSummary,
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
      includeMatches: true,
      orderByReplayDiffs: true,
    });

    expect(paramsFromLastCall()).toEqual({
      clientVersion: String(DIFFS_SUMMARY_CLIENT_VERSION),
      includeReplayIds: "true",
      includeDomDiffIds: "true",
      includeAllDiffs: "true",
      includeMatches: "true",
      orderByReplayDiffs: "true",
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
});
