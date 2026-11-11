import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAssets } from "../asset-upload-utils";
import { uploadAssetsAndTriggerTestRun } from "../upload-assets-and-trigger-test-run";

vi.mock("../asset-upload-utils", () => ({
  uploadAssets: vi.fn(),
  uploadAssetsFromZip: vi.fn(),
}));
vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  initLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logNotice: vi.fn(),
}));

const options = {
  apiToken: "token",
  appDirectory: "/tmp/app",
  commitSha: "head",
  waitForBase: false,
};

describe("uploadAssetsAndTriggerTestRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with a rate-limit-retry skip instead of throwing", async () => {
    vi.mocked(uploadAssets).mockResolvedValue({
      uploadId: "upload-1",
      archiveType: "tar.d",
      testRun: null,
      githubRateLimitRetryScheduled: true,
      message:
        "GitHub primary rate limit hit; scheduled a retry after the reset (~6s).",
    });

    const result = await uploadAssetsAndTriggerTestRun(options);

    expect(result.testRun).toBeNull();
    expect(result.skipReason).toBe("github_rate_limit_retry_scheduled");
    expect(result.sourceDeploymentId).toBe("upload-1");
    expect(result.message).toContain(
      "GitHub primary rate limit hit; scheduled a retry after the reset (~6s).",
    );
    expect(result.message).toContain("created automatically");
  });

  it("still rejects on a bare no-test-run response", async () => {
    vi.mocked(uploadAssets).mockResolvedValue({
      uploadId: "upload-1",
      archiveType: "tar.d",
      testRun: null,
      message: "x",
    });

    await expect(uploadAssetsAndTriggerTestRun(options)).rejects.toThrow("x");
  });
});
