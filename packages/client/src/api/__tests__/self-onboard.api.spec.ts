import { describe, expect, it, vi } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import { SelfOnboardError, selfOnboard } from "../self-onboard.api";

const RESPONSE = {
  created: true,
  organization: { id: "org-1", name: "acme" },
  project: { id: "proj-1", name: "web" },
  apiToken: "secret",
  recordingToken: "rec",
};

const fetchError = (status: number, data: unknown = {}) =>
  Object.assign(new Error(`HTTP ${status}`), {
    response: { status, statusText: "", data, headers: {} },
    config: { url: "oauth/self-onboard", method: "POST" },
  });

const clientRejecting = (error: unknown) =>
  ({
    post: vi.fn().mockRejectedValue(error),
  }) as unknown as MeticulousClient;

describe("selfOnboard", () => {
  it("posts the project name and returns the body", async () => {
    const post = vi.fn().mockResolvedValue({ data: RESPONSE });
    const client = { post } as unknown as MeticulousClient;

    await expect(selfOnboard(client, { projectName: "web" })).resolves.toEqual(
      RESPONSE,
    );
    expect(post).toHaveBeenCalledWith(
      "oauth/self-onboard",
      { projectName: "web" },
      expect.objectContaining({ retry: expect.any(Object) as unknown }),
    );
  });

  it("does not retry a 429", async () => {
    const post = vi.fn().mockResolvedValue({ data: RESPONSE });
    await selfOnboard({ post } as unknown as MeticulousClient, {
      projectName: "web",
    });
    const config = post.mock.calls[0][2] as {
      retry: { shouldRetry: (error: unknown) => boolean };
    };
    const shouldRetry = config.retry.shouldRetry;
    expect(shouldRetry(fetchError(429))).toBe(false);
    expect(shouldRetry(fetchError(503))).toBe(true);
  });

  it.each([
    [429, "rate-limited"],
    [401, "not-logged-in"],
    [403, "forbidden"],
    [409, "unknown"],
    [404, "unsupported"],
    [500, "unknown"],
  ])("maps HTTP %s to %s", async (status, kind) => {
    const error = await selfOnboard(clientRejecting(fetchError(status)), {
      projectName: "web",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SelfOnboardError);
    expect((error as SelfOnboardError).kind).toBe(kind);
  });

  it("maps the server's project-limit-reached reason", async () => {
    const error = await selfOnboard(
      clientRejecting(
        fetchError(403, {
          message: "Self-onboarded organizations are limited to 3 projects.",
          reason: "project-limit-reached",
        }),
      ),
      { projectName: "web" },
    ).catch((e: unknown) => e);
    expect((error as SelfOnboardError).kind).toBe("project-limit-reached");
    expect((error as Error).message).toBe(
      "Self-onboarded organizations are limited to 3 projects.",
    );
  });

  it("prefers the server's message", async () => {
    const error = await selfOnboard(
      clientRejecting(
        fetchError(429, { message: "You already have 3 trial projects." }),
      ),
      { projectName: "web" },
    ).catch((e: unknown) => e);
    expect((error as Error).message).toBe("You already have 3 trial projects.");
  });

  it("rethrows non-HTTP errors unchanged", async () => {
    const original = new Error("socket hang up");
    await expect(
      selfOnboard(clientRejecting(original), { projectName: "web" }),
    ).rejects.toBe(original);
  });
});
