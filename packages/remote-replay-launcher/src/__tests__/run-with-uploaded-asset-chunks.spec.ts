import {
  createRunWithUploadedAssetChunks,
  triggerRunWithUploadedAssetChunks,
} from "@alwaysmeticulous/client";
import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollWhileBaseNotFound } from "../poll-for-base-test-run";
import { runWithUploadedAssetChunks } from "../run-with-uploaded-asset-chunks";

vi.mock("@alwaysmeticulous/client", () => ({
  createRunWithUploadedAssetChunks: vi.fn(),
  triggerRunWithUploadedAssetChunks: vi.fn(),
}));
vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  initLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("../asset-upload-utils", () => ({ uploadGitDiffToS3: vi.fn() }));
vi.mock("../poll-for-base-test-run", () => ({
  pollWhileBaseNotFound: vi.fn(),
}));
vi.mock("@sentry/node", () => ({ captureMessage: vi.fn() }));

const TEST_RUN = { id: "test-run-123" };

const severedConnection = (): Error => {
  const error = new TypeError("fetch failed");
  (error as TypeError & { cause?: unknown }).cause = { code: "UND_ERR_SOCKET" };
  return error;
};

const run = () =>
  runWithUploadedAssetChunks({
    client: {} as never,
    commitSha: "abc123def456",
    waitForBase: false,
    rewrites: [],
    assetReferencesManifest: [{ name: "app", versionId: "v1" }],
  });

describe("runWithUploadedAssetChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(createRunWithUploadedAssetChunks).mockResolvedValue({
      sourceDeploymentId: "deployment-123",
    } as never);
    vi.mocked(pollWhileBaseNotFound).mockImplementation(({ initialResult }) =>
      Promise.resolve(initialResult as never),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a trigger whose connection was severed", async () => {
    vi.mocked(triggerRunWithUploadedAssetChunks)
      .mockRejectedValueOnce(severedConnection())
      .mockResolvedValueOnce({ testRun: TEST_RUN } as never);

    const promise = run();
    await vi.advanceTimersByTimeAsync(120_000);

    expect((await promise).testRun).toEqual(TEST_RUN);
    expect(triggerRunWithUploadedAssetChunks).toHaveBeenCalledTimes(2);
  });

  it("does not retry a genuine client error", async () => {
    vi.mocked(triggerRunWithUploadedAssetChunks).mockRejectedValue(
      Object.assign(new Error("HTTP 400"), { response: { status: 400 } }),
    );

    const promise = run();
    const assertion = expect(promise).rejects.toThrow("HTTP 400");
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;

    expect(triggerRunWithUploadedAssetChunks).toHaveBeenCalledTimes(1);
  });
});
