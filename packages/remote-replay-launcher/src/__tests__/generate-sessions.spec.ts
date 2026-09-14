import {
  completeAgenticSessionGeneration,
  createClient,
} from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSessions } from "../generate-sessions";
import { uploadBuild } from "../upload-build";

vi.mock("@alwaysmeticulous/client", () => ({
  completeAgenticSessionGeneration: vi.fn(),
  createClient: vi.fn(),
  getApiToken: vi.fn((token) => token),
}));
vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
}));
vi.mock("../asset-upload-utils", () => ({
  uploadAgenticInstructionsToS3: vi.fn(),
}));
vi.mock("../upload-build", () => ({
  uploadBuild: vi.fn(),
}));

describe("generateSessions container deployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(uploadBuild).mockResolvedValue({
      deploymentId: "deployment123",
      uploadId: "upload123",
      imageReference: "registry.example/app:upload123",
    });
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run123",
    });
  });

  it("registers the pushed container before launching Agent Review", async () => {
    await generateSessions({
      apiToken: "token",
      projectId: "project123",
      localImageTag: "app:head",
      commitSha: "abc123",
      containerPort: 3000,
      containerEnv: [{ name: "FOO", value: "bar" }],
      containerHealthCheckEndpoint: "/health",
    });

    expect(uploadBuild).toHaveBeenCalledWith({
      apiToken: "token",
      commitSha: "abc123",
      localImageTag: "app:head",
      containerPort: 3000,
      containerEnv: [{ name: "FOO", value: "bar" }],
      containerHealthCheckEndpoint: "/health",
      projectId: "project123",
    });
    expect(vi.mocked(uploadBuild).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(completeAgenticSessionGeneration).mock.invocationCallOrder[0],
    );
  });

  it("does not launch Agent Review when registration fails", async () => {
    vi.mocked(uploadBuild).mockRejectedValue(new Error("registration failed"));

    await expect(
      generateSessions({
        apiToken: "token",
        localImageTag: "app:head",
        commitSha: "abc123",
      }),
    ).rejects.toThrow("registration failed");

    expect(completeAgenticSessionGeneration).not.toHaveBeenCalled();
  });
});
