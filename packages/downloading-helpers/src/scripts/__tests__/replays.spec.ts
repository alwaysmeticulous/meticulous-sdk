import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getReplay, getReplayV3DownloadUrls } from "@alwaysmeticulous/client";
import { runWithLocalDataDir } from "@alwaysmeticulous/common";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  downloadAndExtractFile,
  downloadFile,
} from "../../file-downloads/download-file";
import {
  getOrFetchReplayArchive,
  type BestEffortFileType,
  type ReplayFileType,
} from "../replays";

// `vi.mock` calls are auto-hoisted above the imports above; the order matches
// the project's `import/order` rule.
vi.mock("@alwaysmeticulous/client", () => ({
  getReplay: vi.fn(() => ({ version: "v3" })),
  getReplayV3DownloadUrls: vi.fn(() => buildDownloadUrls()),
}));

vi.mock("../../file-downloads/download-file", () => ({
  downloadFile: vi.fn(() => undefined),
  downloadAndExtractFile: vi.fn(() => undefined),
}));

const REPLAY_ID = "replay-123";

// Minimal v3 download URL fixture covering the file types this PR cares about.
const buildDownloadUrls = (): unknown => ({
  // Plain `rest` keys (downloaded via downloadAndExtractFile into <key>).
  timeline: { signedUrl: "https://example/timeline", filePath: "timeline" },
  metadata: { signedUrl: "https://example/metadata", filePath: "metadata" },
  playbackData: {
    signedUrl: "https://example/playbackData",
    filePath: "playbackData",
  },
  rawCoverage: {
    signedUrl: "https://example/rawCoverage",
    filePath: "rawCoverage",
  },
  // Special-cased keys (each handled in its own branch).
  screenshots: {},
  diffs: {},
  snapshottedAssets: null,
  rawPerScreenshotCssCoverage: null,
  rawPerScreenshotJsCoverage: null,
  mappedPerScreenshotJsCoverage: null,
  // NESTED grouped key recently added by the backend. The URL lives at
  // `entry.file.signedUrl`, so this must NOT be treated as a flat rest
  // artifact (doing so would call `downloadAndExtractFile(undefined, ...)`).
  customCheckSnapshots: {
    "my-check": {
      file: {
        signedUrl: "https://example/customCheckSnapshots/my-check",
        filePath: "customCheckSnapshots/my-check",
      },
    },
  },
});

describe("getOrFetchReplayArchive — excludeFileTypes", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "met-replays-spec-"));
    vi.clearAllMocks();
    (getReplay as Mock).mockResolvedValue({ version: "v3" });
    (getReplayV3DownloadUrls as Mock).mockResolvedValue(buildDownloadUrls());
    (downloadFile as Mock).mockResolvedValue(undefined);
    (downloadAndExtractFile as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const replayDir = (): string => join(dataDir, "replays", REPLAY_ID);
  const markerPath = (): string =>
    join(replayDir(), "previously-downloaded.txt");

  const run = (
    excludeFileTypes?: ReadonlySet<ReplayFileType>,
  ): Promise<{ fileName: string }> =>
    runWithLocalDataDir(dataDir, () =>
      getOrFetchReplayArchive(
        {} as never,
        REPLAY_ID,
        "everything",
        false,
        excludeFileTypes ? { excludeFileTypes } : {},
      ),
    );

  it("writes the cache marker when no exclusions are set", async () => {
    await run();

    expect(existsSync(markerPath())).toBe(true);
    expect(readFileSync(markerPath(), "utf8")).toBe("everything");
  });

  it("does NOT write the cache marker when exclusions are set", async () => {
    await run(new Set<ReplayFileType>(["playbackData", "rawCoverage"]));

    expect(existsSync(markerPath())).toBe(false);
  });

  it("skips downloading excluded file types but still downloads the rest", async () => {
    await run(new Set<ReplayFileType>(["playbackData", "rawCoverage"]));

    const downloadedKeys = (downloadAndExtractFile as Mock).mock.calls.map(
      (call) => call[0] as string,
    );

    expect(downloadedKeys).toEqual(
      expect.arrayContaining([
        "https://example/timeline",
        "https://example/metadata",
      ]),
    );
    expect(downloadedKeys).not.toContain("https://example/playbackData");
    expect(downloadedKeys).not.toContain("https://example/rawCoverage");
  });

  it("does not treat customCheckSnapshots as a flat artifact and never downloads from an undefined URL", async () => {
    await run();

    const downloadedKeys = (downloadAndExtractFile as Mock).mock.calls.map(
      (call) => call[0] as unknown,
    );

    // The crux of the bug: the nested key must never reach `new URL` as
    // `undefined`, and its inner `entry.file.signedUrl` must not be downloaded
    // by this helper.
    expect(downloadedKeys).not.toContain(undefined);
    expect(downloadedKeys).not.toContain(
      "https://example/customCheckSnapshots/my-check",
    );
    // The genuine flat artifacts are still downloaded.
    expect(downloadedKeys).toEqual(
      expect.arrayContaining([
        "https://example/timeline",
        "https://example/metadata",
      ]),
    );
  });

  it("handles an empty customCheckSnapshots ({}) without crashing", async () => {
    (getReplayV3DownloadUrls as Mock).mockResolvedValue({
      ...(buildDownloadUrls() as Record<string, unknown>),
      customCheckSnapshots: {},
    });

    await expect(run()).resolves.toBeDefined();

    const downloadedKeys = (downloadAndExtractFile as Mock).mock.calls.map(
      (call) => call[0] as unknown,
    );
    expect(downloadedKeys).not.toContain(undefined);
  });

  it("defensively skips any unknown grouped/nested key that lacks a top-level signedUrl", async () => {
    // Simulate a hypothetical future backend key that, like customCheckSnapshots,
    // is nested rather than a flat S3Location. The guard must skip it instead of
    // passing `undefined` to `new URL`.
    (getReplayV3DownloadUrls as Mock).mockResolvedValue({
      ...(buildDownloadUrls() as Record<string, unknown>),
      someFutureNestedKey: { foo: { file: { signedUrl: "x", filePath: "y" } } },
    });

    await expect(run()).resolves.toBeDefined();

    const downloadedKeys = (downloadAndExtractFile as Mock).mock.calls.map(
      (call) => call[0] as unknown,
    );
    expect(downloadedKeys).not.toContain(undefined);
  });

  it("hits the cache short-circuit when the marker says 'everything' and no exclusions are set", async () => {
    // Pre-seed the marker as if a prior unfiltered run completed.
    await mkdir(replayDir(), { recursive: true });
    await writeFile(markerPath(), "everything", "utf-8");

    await run();

    expect(getReplay as Mock).not.toHaveBeenCalled();
    expect(getReplayV3DownloadUrls as Mock).not.toHaveBeenCalled();
    expect(downloadAndExtractFile as Mock).not.toHaveBeenCalled();
  });

  it("bypasses the cache short-circuit when exclusions are set, even if the marker says 'everything'", async () => {
    await mkdir(replayDir(), { recursive: true });
    await writeFile(markerPath(), "everything", "utf-8");

    await run(new Set<ReplayFileType>(["playbackData"]));

    // Short-circuit was bypassed: we re-fetched URLs and re-downloaded the
    // non-excluded files.
    expect(getReplayV3DownloadUrls as Mock).toHaveBeenCalledTimes(1);
    const downloadedKeys = (downloadAndExtractFile as Mock).mock.calls.map(
      (call) => call[0] as string,
    );
    expect(downloadedKeys).toContain("https://example/timeline");
    expect(downloadedKeys).not.toContain("https://example/playbackData");
    // Marker is preserved (not overwritten) — we read but didn't rewrite it.
    expect(readFileSync(markerPath(), "utf8")).toBe("everything");
  });
});

describe("getOrFetchReplayArchive — bestEffortFileTypes", () => {
  let dataDir: string;

  const SNAPSHOT_ASSETS_URL = "https://example/snapshotted-assets";

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "met-replays-besteffort-"));
    vi.clearAllMocks();
    (getReplay as Mock).mockResolvedValue({ version: "v3" });
    // Give snapshottedAssets a real URL so its download thunk actually runs.
    (getReplayV3DownloadUrls as Mock).mockResolvedValue({
      ...(buildDownloadUrls() as Record<string, unknown>),
      snapshottedAssets: {
        signedUrl: SNAPSHOT_ASSETS_URL,
        filePath: "snapshotted-assets.zip",
      },
    });
    // Fail only the snapshotted-assets download (simulates a pruned object / 403).
    (downloadAndExtractFile as Mock).mockImplementation((signedUrl: string) => {
      if (signedUrl === SNAPSHOT_ASSETS_URL) {
        throw new Error("Request failed with status code 403");
      }
      return undefined;
    });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const markerPath = (): string =>
    join(dataDir, "replays", REPLAY_ID, "previously-downloaded.txt");

  const run = (
    bestEffortFileTypes?: ReadonlySet<BestEffortFileType>,
  ): Promise<{ fileName: string }> =>
    runWithLocalDataDir(dataDir, () =>
      getOrFetchReplayArchive(
        {} as never,
        REPLAY_ID,
        "everything",
        false,
        bestEffortFileTypes ? { bestEffortFileTypes } : {},
      ),
    );

  it("swallows a best-effort artifact failure and still downloads the rest", async () => {
    await expect(
      run(new Set<BestEffortFileType>(["snapshottedAssets"])),
    ).resolves.toBeDefined();

    const downloadedKeys = (downloadAndExtractFile as Mock).mock.calls.map(
      (call) => call[0] as string,
    );
    // The failing asset download was attempted, but the mandatory files still
    // downloaded and the overall call resolved.
    expect(downloadedKeys).toContain(SNAPSHOT_ASSETS_URL);
    expect(downloadedKeys).toContain("https://example/timeline");
  });

  it("propagates the failure when the artifact is NOT marked best-effort", async () => {
    await expect(run()).rejects.toThrow("403");
  });

  it("does NOT write the cache marker when only best-effort types are set", async () => {
    // A swallowed best-effort failure may leave the directory incomplete, so
    // the marker must not be written — otherwise a later unfiltered caller
    // would short-circuit and skip re-fetching the missing optional artifact.
    await run(new Set<BestEffortFileType>(["snapshottedAssets"]));

    expect(existsSync(markerPath())).toBe(false);
  });
});

describe("getOrFetchReplayArchive — missing signedUrl", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "met-replays-nourl-"));
    vi.clearAllMocks();
    (getReplay as Mock).mockResolvedValue({ version: "v3" });
    // A replay record present but missing its `signedUrl` — the input shape
    // behind the `Invalid URL: 'undefined'` crashes.
    (getReplayV3DownloadUrls as Mock).mockResolvedValue({
      ...(buildDownloadUrls() as Record<string, unknown>),
      snapshottedAssets: {
        signedUrl: undefined,
        filePath: "snapshotted-assets.zip",
      },
    });
    (downloadAndExtractFile as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const run = (
    bestEffortFileTypes?: ReadonlySet<BestEffortFileType>,
  ): Promise<{ fileName: string }> =>
    runWithLocalDataDir(dataDir, () =>
      getOrFetchReplayArchive(
        {} as never,
        REPLAY_ID,
        "everything",
        false,
        bestEffortFileTypes ? { bestEffortFileTypes } : {},
      ),
    );

  it("throws a diagnosable error (not a cryptic Invalid URL) when a mandatory artifact has no URL", async () => {
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("snapshotted-assets");
    expect((error as Error).message).toContain("no download URL");
    expect((error as Error).message).not.toContain("Invalid URL");
  });

  it("swallows a missing URL when the artifact is marked best-effort", async () => {
    await expect(
      run(new Set<BestEffortFileType>(["snapshottedAssets"])),
    ).resolves.toBeDefined();
  });
});
