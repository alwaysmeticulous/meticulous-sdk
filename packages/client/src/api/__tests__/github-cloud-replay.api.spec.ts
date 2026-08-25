import { describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import { takeBaseWorkflowDispatchLease } from "../github-cloud-replay.api";

describe("takeBaseWorkflowDispatchLease", () => {
  const asClient = (post: Mock): MeticulousClient =>
    ({ post }) as unknown as MeticulousClient;

  const take = (post: Mock) =>
    takeBaseWorkflowDispatchLease({
      client: asClient(post),
      baseCommitSha: "6f42ddee",
      workflowId: "run-meticulous-app-tests.yaml",
    });

  it("passes on the verdict, and says where it asked for it", async () => {
    const post = vi.fn().mockResolvedValue({ data: { shouldDispatch: false } });

    expect(await take(post)).toBe(false);
    expect(post).toHaveBeenCalledWith(
      "github-cloud-replay/base-workflow-dispatch-lease",
      {
        baseCommitSha: "6f42ddee",
        workflowId: "run-meticulous-app-tests.yaml",
      },
    );
  });

  // A caller that throws here dispatches nothing, so the commit goes unbuilt —
  // strictly worse than the duplicate build the lease exists to avoid.
  it.each([
    ["the backend is unreachable", new Error("ECONNREFUSED")],
    [
      "the route is not served",
      Object.assign(new Error("Not Found"), { response: { status: 404 } }),
    ],
    [
      "the token is rejected",
      Object.assign(new Error("Forbidden"), { response: { status: 403 } }),
    ],
    // Nothing guarantees a rejection is an Error, and a throw from the failure
    // handler would lose the base just as surely as a throw from the request.
    ["the rejection isn't even an Error", { status: 500 }],
  ])("dispatches anyway when %s", async (_name, error) => {
    const post = vi.fn().mockRejectedValue(error);

    expect(await take(post)).toBe(true);
  });

  // A 200 is not by itself a verdict. Reading a reply we don't understand as a
  // refusal would withhold the dispatch, which is the failure the rejection
  // cases above exist to rule out, reached through a different door.
  it.each([
    ["the field is missing", {}],
    ["the body isn't an object", "<html>blocked by proxy</html>"],
    ["the body is null", null],
    ["the field isn't a boolean", { shouldDispatch: "no" }],
  ])(
    "dispatches anyway when the reply is not the contract: %s",
    async (_name, data) => {
      const post = vi.fn().mockResolvedValue({ data });

      expect(await take(post)).toBe(true);
    },
  );

  it("withholds the dispatch only when refused outright", async () => {
    const post = vi.fn().mockResolvedValue({ data: { shouldDispatch: false } });

    expect(await take(post)).toBe(false);
  });
});
