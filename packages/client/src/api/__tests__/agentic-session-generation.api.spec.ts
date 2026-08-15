import { describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import { completeAgenticSessionGeneration } from "../agentic-session-generation.api";

describe("completeAgenticSessionGeneration", () => {
  it("redacts the TOTP seed and password from a failed launch request", async () => {
    const launchError = {
      config: {
        data: {
          appTarget: {
            backend: {
              password: "password",
              totpSecret: "TESTTOTPSECRET",
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
          assetsUploadId: "upload",
          backend: {
            url: "https://staging.example.com",
            password: "password",
            totpSecret: "TESTTOTPSECRET",
          },
        },
      }),
    ).rejects.toBe(launchError);

    expect(launchError.config.data).toEqual({
      appTarget: {
        backend: {
          password: "[REDACTED]",
          totpSecret: "[REDACTED]",
        },
      },
    });
  });
});
