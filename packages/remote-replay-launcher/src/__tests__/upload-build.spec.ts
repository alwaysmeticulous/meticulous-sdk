import { agentUploadContainerBuild } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadBuild } from "../upload-build";
import { pushContainerImage } from "../upload-container";

vi.mock("@alwaysmeticulous/client", () => ({
  agentUploadAssetBuild: vi.fn(),
  agentUploadContainerBuild: vi.fn(),
  createClient: vi.fn(),
  getApiToken: vi.fn((token) => token),
}));
vi.mock("@alwaysmeticulous/common", () => ({
  logProgress: vi.fn(),
}));
vi.mock("../asset-upload-utils", () => ({
  uploadAssetBytesFromDirectory: vi.fn(),
  uploadAssetBytesFromZip: vi.fn(),
}));
vi.mock("../upload-container", () => ({
  pushContainerImage: vi.fn(),
}));

describe("uploadBuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pushContainerImage).mockResolvedValue({
      client: {} as never,
      uploadId: "upload123",
      imageReference: "registry.example/app:upload123",
    });
    vi.mocked(agentUploadContainerBuild).mockResolvedValue({
      deploymentId: "deployment123",
    });
  });

  it("returns the upload identity with the registered container deployment", async () => {
    await expect(
      uploadBuild({
        apiToken: "token",
        commitSha: "abc123",
        localImageTag: "app:head",
      }),
    ).resolves.toEqual({
      deploymentId: "deployment123",
      uploadId: "upload123",
      imageReference: "registry.example/app:upload123",
    });
  });
});
