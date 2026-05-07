import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  getReplay,
  getReplayV3DownloadUrls,
} from "@alwaysmeticulous/client";
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
  type ReplayFileType,
} from "../replays";

// `vi.mock` calls are auto-hoisted above the imports above; the order matches
// the project's `import/order` rule.
vi.mock("@alwaysmeticulous/client", () => ({
  getReplay: vi.fn(async () => ({ version: "v3" })),
  getReplayV3DownloadUrls: vi.fn(async () => buildDownloadUrls()),
}));

vi.mock("../../file-downloads/download-file", () => ({
  downloadFile: vi.fn(async () => undefined),
  downloadAndExtractFile: vi.fn(async () => undefined),
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
