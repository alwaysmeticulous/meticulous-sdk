import { describe, expect, it, vi } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  approveCheck,
  getCheckComments,
  ignoreCheck,
  rejectCheck,
} from "../agent-check-reviews.api";

const postClient = (data: unknown) => {
  const post = vi.fn().mockResolvedValue({ data });
  return { post, client: { post } as unknown as MeticulousClient };
};

describe("check review writes", () => {
  it.each([
    ["reject", rejectCheck],
    ["ignore", ignoreCheck],
  ] as const)(
    "posts the %s reason and checkType to the encoded check resource",
    async (action, write) => {
      const { post, client } = postClient({});

      await expect(
        write({
          client,
          testRunId: "tr-1",
          checkId: "my check",
          checkType: "custom",
          reason: "Bundle grew by 40KB",
        }),
      ).resolves.toEqual({});
      expect(post).toHaveBeenCalledWith(
        `agent/test-runs/tr-1/checks/my%20check/${action}`,
        { reason: "Bundle grew by 40KB", checkType: "custom" },
      );
    },
  );

  it("omits an absent reason and checkType from an approval", async () => {
    const { post, client } = postClient({});

    await expect(
      approveCheck({ client, testRunId: "tr-1", checkId: "network-requests" }),
    ).resolves.toEqual({});
    expect(post).toHaveBeenCalledWith(
      "agent/test-runs/tr-1/checks/network-requests/approve",
      {},
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
