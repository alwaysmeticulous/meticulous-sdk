import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  agentTriggerTestRun,
  agentUploadAssetBuild,
  agentUploadContainerBuild,
  agentUploadGitDiffBuild,
  completeContainerUpload,
  requestDeploymentSourceMapArtifactUpload,
  triggerDeploymentSourceMapIngestion,
} from "../project-deployments.api";

describe("agent project-deployment client helpers", () => {
  let client: { post: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  const lastCall = (): unknown[] => client.post.mock.calls[0];

  beforeEach(() => {
    client = { post: vi.fn().mockResolvedValue({ data: {} }) };
  });

  describe("agentUploadAssetBuild", () => {
    it("posts to the asset endpoint with the body and no project query", async () => {
      client.post.mockResolvedValue({ data: { deploymentId: "dep-1" } });

      const result = await agentUploadAssetBuild({
        client: asClient(),
        uploadId: "upload-1",
        commitSha: "sha-1",
        rewrites: [],
        archiveType: "zip",
      });

      expect(lastCall()).toEqual([
        "agent/upload-build/asset",
        {
          uploadId: "upload-1",
          commitSha: "sha-1",
          rewrites: [],
          archiveType: "zip",
        },
        undefined,
      ]);
      expect(result).toEqual({ deploymentId: "dep-1" });
    });

    it("passes project through as a query param for OAuth callers", async () => {
      await agentUploadAssetBuild({
        client: asClient(),
        project: "proj-1",
        uploadId: "upload-1",
        commitSha: "sha-1",
        rewrites: [],
        archiveType: "tar.d",
      });

      expect(client.post).toHaveBeenCalledWith(
        "agent/upload-build/asset",
        {
          uploadId: "upload-1",
          commitSha: "sha-1",
          rewrites: [],
          archiveType: "tar.d",
        },
        { params: { project: "proj-1" } },
      );
    });
  });

  describe("agentUploadContainerBuild", () => {
    it("posts to the container endpoint", async () => {
      await agentUploadContainerBuild({
        client: asClient(),
        uploadId: "upload-1",
        commitSha: "sha-1",
        containerPort: 8080,
      });

      expect(lastCall()).toEqual([
        "agent/upload-build/container",
        { uploadId: "upload-1", commitSha: "sha-1", containerPort: 8080 },
        undefined,
      ]);
    });
  });

  describe("agentUploadGitDiffBuild", () => {
    it("posts to the git-diff endpoint and returns the upload url and resolved deploymentId", async () => {
      client.post.mockResolvedValue({
        data: { uploadUrl: "https://signed", deploymentId: "dep-1" },
      });

      const result = await agentUploadGitDiffBuild({
        client: asClient(),
        deploymentId: "dep-1",
        baseSha: "base-1",
        size: 123,
      });

      expect(lastCall()).toEqual([
        "agent/upload-build/git-diff",
        { deploymentId: "dep-1", baseSha: "base-1", size: 123 },
        undefined,
      ]);
      expect(result).toEqual({
        uploadUrl: "https://signed",
        deploymentId: "dep-1",
      });
    });

    it("posts commitSha instead of deploymentId when identifying the deployment by commit", async () => {
      client.post.mockResolvedValue({
        data: { uploadUrl: "https://signed", deploymentId: "dep-resolved" },
      });

      const result = await agentUploadGitDiffBuild({
        client: asClient(),
        commitSha: "sha-1",
        baseSha: "base-1",
        size: 123,
      });

      expect(lastCall()).toEqual([
        "agent/upload-build/git-diff",
        { commitSha: "sha-1", baseSha: "base-1", size: 123 },
        undefined,
      ]);
      expect(result).toEqual({
        uploadUrl: "https://signed",
        deploymentId: "dep-resolved",
      });
    });
  });

  describe("agentTriggerTestRun", () => {
    it("posts to the trigger endpoint with deploymentId + baseSha", async () => {
      client.post.mockResolvedValue({
        data: { testRun: { id: "tr-1" }, commitSha: "sha-1" },
      });

      const result = await agentTriggerTestRun({
        client: asClient(),
        deploymentId: "dep-1",
        baseSha: "base-1",
      });

      expect(lastCall()).toEqual([
        "agent/trigger-test-run",
        { deploymentId: "dep-1", baseSha: "base-1" },
        undefined,
      ]);
      expect(result).toEqual({ testRun: { id: "tr-1" }, commitSha: "sha-1" });
    });

    it("forwards sessionIds in the request body", async () => {
      await agentTriggerTestRun({
        client: asClient(),
        deploymentId: "dep-1",
        baseSha: "base-1",
        sessionIds: ["session-a", "session-b"],
      });

      expect(lastCall()).toEqual([
        "agent/trigger-test-run",
        {
          deploymentId: "dep-1",
          baseSha: "base-1",
          sessionIds: ["session-a", "session-b"],
        },
        undefined,
      ]);
    });
  });
});

describe("completeContainerUpload", () => {
  it("surfaces the backend error message instead of only the HTTP status", async () => {
    const error = Object.assign(new Error("HTTP 404: Not Found"), {
      config: {
        method: "POST",
        url: "https://app.meticulous.ai/api/project-deployments/complete-container-upload",
      },
      response: {
        status: 404,
        statusText: "Not Found",
        data: {
          statusCode: 404,
          message:
            "Container image test-project/app:upload-1 not found in Harbor registry.",
          error: "Not Found",
        },
        headers: {},
      },
    });
    const client = {
      post: vi.fn().mockRejectedValue(error),
    } as unknown as MeticulousClient;

    await expect(
      completeContainerUpload({
        client,
        uploadId: "upload-1",
        commitSha: "sha-1",
        mustHaveBase: false,
      }),
    ).rejects.toThrow(
      "Container image test-project/app:upload-1 not found in Harbor registry.",
    );
  });
});

describe("requestDeploymentSourceMapArtifactUpload", () => {
  it("posts the object size and source-map hash to the deployment-bound endpoint", async () => {
    const client = {
      post: vi
        .fn()
        .mockResolvedValue({ data: { uploadUrl: "https://signed" } }),
    };

    await expect(
      requestDeploymentSourceMapArtifactUpload({
        client: client as unknown as MeticulousClient,
        projectDeploymentId: "deployment-1",
        sourceMapSha256: "a".repeat(64),
        size: 123,
      }),
    ).resolves.toEqual({ uploadUrl: "https://signed" });

    expect(client.post).toHaveBeenCalledWith(
      "project-deployments/deployment-1/source-map-mapping-artifact-upload-url",
      { sourceMapSha256: "a".repeat(64), size: 123 },
    );
  });
});

describe("triggerDeploymentSourceMapIngestion", () => {
  it("posts to the authenticated deployment ingestion endpoint", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ data: { scheduled: true } }),
    };

    await expect(
      triggerDeploymentSourceMapIngestion({
        client: client as unknown as MeticulousClient,
        deploymentUploadId: "upload-1",
      }),
    ).resolves.toEqual({ scheduled: true });

    expect(client.post).toHaveBeenCalledWith(
      "project-deployments/upload-1/ingest-source-maps",
      {},
      undefined,
    );
  });
});
