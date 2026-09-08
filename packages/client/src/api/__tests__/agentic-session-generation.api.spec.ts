import { describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  completeAgenticSessionGeneration,
  listAgenticRepoSourceFiles,
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
          assetsUploadId: "upload",
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

describe("listAgenticRepoSourceFiles", () => {
  it("waits beyond the backend deadline and preserves the project query", async () => {
    const response = { paths: ["src/index.ts"], truncated: false };
    const client = {
      post: vi.fn().mockResolvedValue({ data: response }),
    } as unknown as { post: Mock };

    await expect(
      listAgenticRepoSourceFiles({
        client: client as unknown as MeticulousClient,
        projectId: "project",
        commitSha: "commit",
        runId: "run",
      }),
    ).resolves.toEqual(response);

    expect(client.post).toHaveBeenCalledWith(
      "agentic-session-generation/repo/source-files",
      { commitSha: "commit", runId: "run" },
      {
        params: { projectId: "project" },
        timeout: 165_000,
      },
    );
  });
});
