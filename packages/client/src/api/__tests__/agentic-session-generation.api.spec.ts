import { describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  completeAgenticSessionGeneration,
  getAgenticFileChanges,
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

describe("getAgenticFileChanges", () => {
  it("posts a single path and returns { diff }", async () => {
    const client = {
      post: vi
        .fn()
        .mockResolvedValue({ data: { diff: "@@ -1 +1 @@\n-a\n+b" } }),
    } as unknown as { post: Mock };

    await expect(
      getAgenticFileChanges({
        client: client as unknown as MeticulousClient,
        projectId: "project",
        commitSha: "commit",
        path: "src/a.ts",
      }),
    ).resolves.toEqual({ diff: "@@ -1 +1 @@\n-a\n+b" });

    expect(client.post).toHaveBeenCalledWith(
      "agentic-session-generation/repo/file-changes",
      { commitSha: "commit", path: "src/a.ts" },
      { params: { projectId: "project" } },
    );
  });

  it("posts paths[] and returns { files }", async () => {
    const response = {
      files: [
        { path: "src/a.ts", diff: "@@ a" },
        { path: "src/missing.ts", diff: "" },
      ],
    };
    const client = {
      post: vi.fn().mockResolvedValue({ data: response }),
    } as unknown as { post: Mock };

    await expect(
      getAgenticFileChanges({
        client: client as unknown as MeticulousClient,
        projectId: "project",
        commitSha: "commit",
        paths: ["src/a.ts", "src/missing.ts"],
      }),
    ).resolves.toEqual(response);

    expect(client.post).toHaveBeenCalledWith(
      "agentic-session-generation/repo/file-changes",
      { commitSha: "commit", paths: ["src/a.ts", "src/missing.ts"] },
      { params: { projectId: "project" } },
    );
  });

  it("omits path and paths to request every changed file", async () => {
    const response = { files: [{ path: "src/a.ts", diff: "@@ a" }] };
    const client = {
      post: vi.fn().mockResolvedValue({ data: response }),
    } as unknown as { post: Mock };

    await expect(
      getAgenticFileChanges({
        client: client as unknown as MeticulousClient,
        projectId: "project",
        commitSha: "commit",
      }),
    ).resolves.toEqual(response);

    expect(client.post).toHaveBeenCalledWith(
      "agentic-session-generation/repo/file-changes",
      { commitSha: "commit" },
      { params: { projectId: "project" } },
    );
  });

  it("returns files: null when the backend has no PR/diff", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ data: { files: null } }),
    } as unknown as { post: Mock };

    await expect(
      getAgenticFileChanges({
        client: client as unknown as MeticulousClient,
        commitSha: "commit",
      }),
    ).resolves.toEqual({ files: null });
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
