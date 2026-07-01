import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  agentTriggerTestRun,
  agentUploadAssetBuild,
  agentUploadContainerBuild,
  agentUploadGitDiffBuild,
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

    it("passes projectId through as a query param for OAuth callers", async () => {
      await agentUploadAssetBuild({
        client: asClient(),
        projectId: "proj-1",
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
        { params: { projectId: "proj-1" } },
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
    it("posts to the git-diff endpoint and returns the upload url", async () => {
      client.post.mockResolvedValue({ data: { uploadUrl: "https://signed" } });

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
      expect(result).toEqual({ uploadUrl: "https://signed" });
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
