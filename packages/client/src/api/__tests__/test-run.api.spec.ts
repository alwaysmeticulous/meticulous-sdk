import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { FetchError } from "../../errors";
import type { MeticulousClient } from "../../types/client.types";
import { markTestRunExpectsCustomChecks } from "../test-run.api";

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
