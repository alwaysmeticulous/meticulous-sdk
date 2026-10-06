import { describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  cancelAgenticTotpSlotWait,
  completeAgenticSessionGeneration,
  reserveAgenticTotpSlot,
} from "../agentic-session-generation.api";

describe("completeAgenticSessionGeneration", () => {
  it("redacts every login-option value from a failed launch request", async () => {
    const launchError = {
      config: {
        data: {
          appTarget: {
            backend: {
              loginOptions: {
                password: "password",
                totpSecret: "TESTTOTPSECRET",
                skipEmailClientId: "trusted-client-id",
              },
            },
          },
        },
      },
    };
    const client = {
      post: vi.fn().mockRejectedValue(launchError),
    } as unknown as { post: Mock };

    await expect(
      completeAgenticSessionGeneration({
        client: client as unknown as MeticulousClient,
        projectId: "project",
        commitSha: "commit",
        appTarget: {
          type: "assets",
          projectDeploymentId: "deployment",
          backend: {
            url: "https://staging.example.com",
            loginOptions: {
              password: "password",
              totpSecret: "TESTTOTPSECRET",
              skipEmailClientId: "trusted-client-id",
            },
          },
        },
      }),
    ).rejects.toBe(launchError);

    expect(launchError.config.data).toEqual({
      appTarget: {
        backend: {
          loginOptions: {
            password: "[REDACTED]",
            totpSecret: "[REDACTED]",
            skipEmailClientId: "[REDACTED]",
          },
        },
      },
    });
  });
});

describe("reserveAgenticTotpSlot", () => {
  it("posts the run identity without any login credentials", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({
        data: { reserved: false, retryAfterMs: 12_345 },
      }),
    } as unknown as { post: Mock };

    await expect(
      reserveAgenticTotpSlot({
        client: client as unknown as MeticulousClient,
        projectId: "project",
        agenticRunId: "run",
      }),
    ).resolves.toEqual({ reserved: false, retryAfterMs: 12_345 });

    expect(client.post).toHaveBeenCalledWith(
      "agentic-session-generation/totp-slot",
      { agenticRunId: "run" },
      { params: { projectId: "project" } },
    );
  });

  it("posts a cancellation when the run stops waiting", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ data: {} }),
    } as unknown as { post: Mock };

    await cancelAgenticTotpSlotWait({
      client: client as unknown as MeticulousClient,
      projectId: "project",
      agenticRunId: "run",
    });

    expect(client.post).toHaveBeenCalledWith(
      "agentic-session-generation/totp-slot/cancel",
      { agenticRunId: "run" },
      { params: { projectId: "project" } },
    );
  });
});
