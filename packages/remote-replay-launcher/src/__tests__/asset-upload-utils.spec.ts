import type { TestRunTriggerDebugContext } from "@alwaysmeticulous/api";
import {
  completeAssetUpload,
  createClient,
  requestAssetUpload,
} from "@alwaysmeticulous/client";
import { triggerRunOnDeployment } from "@alwaysmeticulous/client/dist/api/project-deployments.api";
import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAssetsFromZip } from "../asset-upload-utils";
import { pollWhileBaseNotFound } from "../poll-for-base-test-run";

vi.mock("fs/promises", () => ({
  stat: vi.fn().mockResolvedValue({ size: 1234 }),
  unlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@alwaysmeticulous/client", () => ({
  getApiToken: vi.fn((token) => token || "mocked-token"),
  createClient: vi.fn(),
  requestAssetUpload: vi.fn(),
  completeAssetUpload: vi.fn(),
  requestGitDiffUpload: vi.fn(),
  requestAgenticInstructionsUpload: vi.fn(),
  getProxyAgent: vi.fn(),
  putFileToSignedUrl: vi.fn(),
  requestMultipartAssetUpload: vi.fn(),
  retryTransientUploadErrors: vi.fn((fn: () => unknown) => fn()),
  UploadError: class UploadError extends Error {},
}));
vi.mock("@alwaysmeticulous/client/dist/api/project-deployments.api", () => ({
  triggerRunOnDeployment: vi.fn(),
}));
// Only the logging is stubbed; the retry helper is kept real so the retry
// behaviour around completeAssetUpload is genuinely exercised.
vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  initLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
}));
vi.mock("../poll-for-base-test-run", () => ({
  pollWhileBaseNotFound: vi.fn(),
}));
vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
}));

const DEBUG_CONTEXT: TestRunTriggerDebugContext = {
  baseResolutionDetails: {
    type: "triggered-new-workflow-run-successfully",
    workflowId: "meticulous.yml",
    msTaken: 1000,
  },
};

const TEST_RUN = { id: "test-run-123" };

describe("uploadAssetsFromZip", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(requestAssetUpload).mockResolvedValue({
      uploadId: "upload-123",
      uploadUrl: "https://signed.example/upload",
    } as never);
    vi.mocked(completeAssetUpload).mockResolvedValue({
      testRun: TEST_RUN,
      baseNotFound: false,
    } as never);
    // The base was found first time, so the caller never polls.
    vi.mocked(pollWhileBaseNotFound).mockImplementation(({ initialResult }) =>
      Promise.resolve(initialResult as never),
    );
  });

  it("reports how the caller resolved the base to the backend", async () => {
    // The zip branch builds its own argument list rather than forwarding the
    // options object, so it can drop this while the directory branch keeps it.
    await uploadAssetsFromZip({
      apiToken: "test-token",
      zipPath: "/tmp/app.zip",
      commitSha: "abc123def456",
      waitForBase: false,
      debugContext: DEBUG_CONTEXT,
    });

    expect(completeAssetUpload).toHaveBeenCalledWith(
      expect.objectContaining({ debugContext: DEBUG_CONTEXT }),
    );
  });

  it("doesn't repeat the resolution on every poll for the base", async () => {
    // It describes a decision made before anything was uploaded, so it is the
    // same on every poll, and the backend logs a line each time it arrives.
    vi.mocked(completeAssetUpload).mockResolvedValue({
      testRun: null,
      baseNotFound: true,
    } as never);
    vi.mocked(triggerRunOnDeployment).mockResolvedValue({
      testRun: TEST_RUN,
      baseNotFound: false,
    } as never);
    vi.mocked(pollWhileBaseNotFound).mockImplementation(async ({ retryFn }) => {
      await retryFn();
      return { testRun: TEST_RUN, baseNotFound: false } as never;
    });

    await uploadAssetsFromZip({
      apiToken: "test-token",
      zipPath: "/tmp/app.zip",
      commitSha: "abc123def456",
      waitForBase: true,
      debugContext: DEBUG_CONTEXT,
    });

    expect(completeAssetUpload).toHaveBeenCalledWith(
      expect.objectContaining({ debugContext: DEBUG_CONTEXT }),
    );
    expect(triggerRunOnDeployment).toHaveBeenCalledWith(
      expect.not.objectContaining({ debugContext: expect.anything() }),
    );
  });
});
