import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  agentUploadAssetBuild,
  agentUploadContainerBuild,
} from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAssetBytesFromDirectory } from "../asset-upload-utils";
import { uploadBuild, type UploadBuildOptions } from "../upload-build";
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
}));
vi.mock("../upload-container", () => ({
  pushContainerImage: vi.fn(),
}));

describe("uploadBuild", () => {
  let appDirectory = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    appDirectory = await mkdtemp(join(tmpdir(), "upload-build-spec-"));
    vi.mocked(pushContainerImage).mockResolvedValue({
      client: {} as never,
      uploadId: "upload123",
      imageReference: "registry.example/app:upload123",
    });
    vi.mocked(agentUploadContainerBuild).mockResolvedValue({
      deploymentId: "deployment123",
    });
    vi.mocked(uploadAssetBytesFromDirectory).mockResolvedValue({
      uploadId: "assetUpload123",
      multipartUploadInfo: { awsUploadId: "aws123", eTags: ["etag1"] },
    });
    vi.mocked(agentUploadAssetBuild).mockResolvedValue({
      deploymentId: "assetDeployment123",
    });
  });

  afterEach(async () => {
    await rm(appDirectory, { recursive: true, force: true });
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

  it("registers a directory upload as a multipart tar.d build", async () => {
    await expect(
      uploadBuild({ apiToken: "token", commitSha: "abc123", appDirectory }),
    ).resolves.toEqual({
      deploymentId: "assetDeployment123",
      uploadId: "assetUpload123",
    });
    expect(agentUploadAssetBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: "assetUpload123",
        archiveType: "tar.d",
        multipartUploadInfo: { awsUploadId: "aws123", eTags: ["etag1"] },
      }),
    );
  });

  it("rejects a call with no build input", async () => {
    await expect(
      uploadBuild({ apiToken: "token", commitSha: "abc123" }),
    ).rejects.toThrow(
      "No build input provided: pass localImageTag or appDirectory.",
    );
  });

  it("rejects a container and an asset directory together", async () => {
    await expect(
      uploadBuild({
        apiToken: "token",
        commitSha: "abc123",
        localImageTag: "app:head",
        appDirectory,
      }),
    ).rejects.toThrow(
      "Provide either a container build (localImageTag) or an asset build (appDirectory), not both.",
    );
    expect(pushContainerImage).not.toHaveBeenCalled();
    expect(uploadAssetBytesFromDirectory).not.toHaveBeenCalled();
  });

  it("rejects a removed appZip option before uploading", async () => {
    const withRemovedZip = {
      apiToken: "token",
      commitSha: "abc123",
      appZip: "build.zip",
    } as UploadBuildOptions;

    await expect(uploadBuild(withRemovedZip)).rejects.toThrow(
      "appZip is no longer supported; pass the build output directory as appDirectory.",
    );
    expect(uploadAssetBytesFromDirectory).not.toHaveBeenCalled();
    expect(pushContainerImage).not.toHaveBeenCalled();
  });

  it("rejects appZip combined with a container instead of uploading the image", async () => {
    const withRemovedZip = {
      apiToken: "token",
      commitSha: "abc123",
      localImageTag: "app:head",
      appZip: "build.zip",
    } as UploadBuildOptions;

    await expect(uploadBuild(withRemovedZip)).rejects.toThrow(
      "appZip is no longer supported; pass the build output directory as appDirectory.",
    );
    expect(pushContainerImage).not.toHaveBeenCalled();
  });

  it("rejects a missing appDirectory before uploading", async () => {
    await expect(
      uploadBuild({
        apiToken: "token",
        commitSha: "abc123",
        appDirectory: join(appDirectory, "does-not-exist"),
      }),
    ).rejects.toThrow(/Directory does not exist:/);
    expect(uploadAssetBytesFromDirectory).not.toHaveBeenCalled();
  });

  it("rejects a file passed as appDirectory before uploading", async () => {
    const filePath = join(appDirectory, "build.zip");
    await writeFile(filePath, "not a directory");

    await expect(
      uploadBuild({
        apiToken: "token",
        commitSha: "abc123",
        appDirectory: filePath,
      }),
    ).rejects.toThrow(/is not a directory/);
    expect(uploadAssetBytesFromDirectory).not.toHaveBeenCalled();
  });
});
