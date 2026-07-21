import type { TestRun } from "@alwaysmeticulous/api";
import {
  agentTriggerTestRun,
  agentUploadGitDiffBuild,
  createClient,
} from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { triggerTestRun } from "../trigger-test-run";
import { uploadBufferToSignedUrl } from "../asset-upload-utils";

vi.mock("@alwaysmeticulous/client", () => ({
  createClient: vi.fn(() => "mock-client"),
  getApiToken: vi.fn((token: string | null | undefined) => token ?? null),
  agentUploadGitDiffBuild: vi.fn(),
  agentTriggerTestRun: vi.fn(),
}));
vi.mock("@alwaysmeticulous/common", () => ({
  logProgress: vi.fn(),
}));
vi.mock("../asset-upload-utils", () => ({
  uploadBufferToSignedUrl: vi.fn(),
}));

describe("triggerTestRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentTriggerTestRun).mockResolvedValue({
      testRun: { id: "tr-1", url: "https://app/tr-1" } as TestRun,
      commitSha: "sha-1",
    });
  });

  it("pins the trigger call to the deployment resolved for a commitSha-based diff upload, instead of re-passing commitSha", async () => {
    vi.mocked(agentUploadGitDiffBuild).mockResolvedValue({
      uploadUrl: "https://signed",
      deploymentId: "dep-resolved",
    });

    await triggerTestRun({
      apiToken: "token",
      commitSha: "sha-1",
      baseSha: "base-1",
      gitDiffOutput: "diff --git a b",
    });

    expect(agentUploadGitDiffBuild).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: "sha-1", baseSha: "base-1" }),
    );
    // The trigger call must reuse the resolved deploymentId, not commitSha —
    // re-passing commitSha would let the backend re-resolve it independently
    // and potentially land on a different deployment than the diff was
    // attached to.
    expect(agentTriggerTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "dep-resolved" }),
    );
    expect(agentTriggerTestRun).toHaveBeenCalledWith(
      expect.not.objectContaining({ commitSha: expect.anything() }),
    );
    expect(uploadBufferToSignedUrl).toHaveBeenCalledWith(
      "https://signed",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "text/plain" }),
    );
  });

  it("uploads the diff against an explicit deploymentId directly, without a commitSha lookup", async () => {
    vi.mocked(agentUploadGitDiffBuild).mockResolvedValue({
      uploadUrl: "https://signed",
      deploymentId: "dep-1",
    });

    await triggerTestRun({
      apiToken: "token",
      deploymentId: "dep-1",
      baseSha: "base-1",
      gitDiffOutput: "diff --git a b",
    });

    expect(agentUploadGitDiffBuild).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "dep-1" }),
    );
    expect(agentUploadGitDiffBuild).toHaveBeenCalledWith(
      expect.not.objectContaining({ commitSha: expect.anything() }),
    );
    expect(agentTriggerTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "dep-1" }),
    );
  });

  it("skips the diff upload and passes commitSha straight through when there is no diff", async () => {
    await triggerTestRun({
      apiToken: "token",
      commitSha: "sha-1",
      baseSha: "base-1",
    });

    expect(agentUploadGitDiffBuild).not.toHaveBeenCalled();
    expect(agentTriggerTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: "sha-1" }),
    );
  });

  it("still requires an API token", async () => {
    vi.mocked(createClient);
    await expect(
      triggerTestRun({
        apiToken: null,
        commitSha: "sha-1",
        baseSha: "base-1",
      }),
    ).rejects.toThrow(/API token/);
  });

  it("rejects when neither deploymentId nor commitSha is provided", async () => {
    await expect(
      triggerTestRun({
        apiToken: "token",
        baseSha: "base-1",
      }),
    ).rejects.toThrow(/Exactly one of deploymentId or commitSha/);
    expect(agentTriggerTestRun).not.toHaveBeenCalled();
  });

  it("forwards maxDurationSeconds to the trigger call when provided", async () => {
    await triggerTestRun({
      apiToken: "token",
      commitSha: "sha-1",
      baseSha: "base-1",
      maxDurationSeconds: 120,
    });

    expect(agentTriggerTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ maxDurationSeconds: 120 }),
    );
  });

  it("forwards an explicit null maxDurationSeconds (unlimited) to the trigger call", async () => {
    await triggerTestRun({
      apiToken: "token",
      commitSha: "sha-1",
      baseSha: "base-1",
      maxDurationSeconds: null,
    });

    expect(agentTriggerTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ maxDurationSeconds: null }),
    );
  });

  it("omits maxDurationSeconds from the trigger call when not provided", async () => {
    await triggerTestRun({
      apiToken: "token",
      commitSha: "sha-1",
      baseSha: "base-1",
    });

    expect(agentTriggerTestRun).toHaveBeenCalledWith(
      expect.not.objectContaining({ maxDurationSeconds: expect.anything() }),
    );
  });

  it("rejects when both deploymentId and commitSha are provided", async () => {
    await expect(
      triggerTestRun({
        apiToken: "token",
        deploymentId: "dep-1",
        commitSha: "sha-1",
        baseSha: "base-1",
      }),
    ).rejects.toThrow(/Exactly one of deploymentId or commitSha/);
    expect(agentTriggerTestRun).not.toHaveBeenCalled();
  });
});
