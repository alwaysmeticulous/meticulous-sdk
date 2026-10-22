import { describe, expect, it, vi } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import { getCheckComments, ignoreCheck } from "../agent-check-reviews.api";

const postClient = (data: unknown) => {
  const post = vi.fn().mockResolvedValue({ data });
  return { post, client: { post } as unknown as MeticulousClient };
};

describe("ignoreCheck", () => {
  it("posts the reason and checkType to the encoded check resource", async () => {
    const { post, client } = postClient({});

    await expect(
      ignoreCheck({
        client,
        testRunId: "tr-1",
        checkId: "my check",
        checkType: "custom",
        reason: "Bundle grew by 40KB",
      }),
    ).resolves.toEqual({});
    expect(post).toHaveBeenCalledWith(
      "agent/test-runs/tr-1/checks/my%20check/ignore",
      { reason: "Bundle grew by 40KB", checkType: "custom" },
    );
  });

  it("omits an absent checkType", async () => {
    const { post, client } = postClient({});

    await ignoreCheck({
      client,
      testRunId: "tr-1",
      checkId: "network-requests",
      reason: "Flaky",
    });
    expect(post).toHaveBeenCalledWith(
      "agent/test-runs/tr-1/checks/network-requests/ignore",
      { reason: "Flaky" },
    );
  });
});

describe("getCheckComments", () => {
  it("sends checkType and includeResolved only when given", async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const client = { get } as unknown as MeticulousClient;

    await getCheckComments({ client, testRunId: "tr-1", checkId: "a11y" });
    await getCheckComments({
      client,
      testRunId: "tr-1",
      checkId: "a11y",
      checkType: "builtin",
      includeResolved: true,
    });

    expect(get).toHaveBeenNthCalledWith(
      1,
      "agent/test-runs/tr-1/checks/a11y/comments",
      { params: {} },
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      "agent/test-runs/tr-1/checks/a11y/comments",
      { params: { checkType: "builtin", includeResolved: "true" } },
    );
  });
});
