import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getTestRunData } from "@alwaysmeticulous/client";
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
import { isTestRunDataWithheldError } from "../../errors";
import { downloadAppContainerLogs } from "../app-container-logs";
import { downloadAndExtractFile } from "../download-file";
import { getOrFetchTestRunData, type TestRunDownloadScope } from "../test-runs";

vi.mock("@alwaysmeticulous/client", () => ({
  getTestRunData: vi.fn(),
}));

vi.mock("../download-file", () => ({
  downloadAndExtractFile: vi.fn(() => undefined),
}));

vi.mock("../app-container-logs", () => ({
  downloadAppContainerLogs: vi.fn(() => undefined),
}));

const TEST_RUN_ID = "testRun1";

const location = (filePath: string) => ({
  filePath,
  signedUrl: `https://example/${filePath}`,
});

const TEST_RUN_DATA = {
  testRunId: TEST_RUN_ID,
  coverage: location("coverage.json.gz"),
  coverageStats: location("coverage-stats.json.gz"),
  coveragePr: location("coverage.pr.json.gz"),
  coverageStatsPr: location("coverage-stats.pr.json.gz"),
  diversityByReplay: location("diversity-by-replay.json.gz"),
};

const {
  coveragePr: _coveragePr,
  coverageStatsPr: _coverageStatsPr,
  ...WITHHELD_TEST_RUN_DATA
} = TEST_RUN_DATA;

describe("getOrFetchTestRunData caching", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "met-test-runs-spec-"));
    vi.clearAllMocks();
    (getTestRunData as Mock).mockResolvedValue(TEST_RUN_DATA);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const testRunDir = (): string => join(dataDir, "test-runs", TEST_RUN_ID);

  const fetch = (scope: TestRunDownloadScope) =>
    runWithLocalDataDir(dataDir, () =>
      getOrFetchTestRunData({} as never, TEST_RUN_ID, scope),
    );

  const downloadedFiles = (): string[] =>
    (downloadAndExtractFile as Mock).mock.calls.map(([url]) =>
      String(url).replace("https://example/", ""),
    );

  it("downloads only the requested scope's files", async () => {
    await fetch("coverage-only");

    expect(downloadedFiles()).toEqual([
      "coverage.json.gz",
      "coverage-stats.json.gz",
    ]);
  });

  it("downloads nothing again for a scope already downloaded", async () => {
    await fetch("coverage-only");
    vi.clearAllMocks();
    (getTestRunData as Mock).mockResolvedValue(TEST_RUN_DATA);

    await fetch("coverage-only");

    expect(downloadedFiles()).toEqual([]);
  });

  it("adds only another scope's files to an earlier download", async () => {
    await fetch("coverage-only");
    vi.clearAllMocks();
    (getTestRunData as Mock).mockResolvedValue(TEST_RUN_DATA);

    await fetch("coverage-pr-only");

    expect(downloadedFiles()).toEqual([
      "coverage.pr.json.gz",
      "coverage-stats.pr.json.gz",
    ]);
    expect(
      readFileSync(join(testRunDir(), "downloaded-scopes.txt"), "utf-8"),
    ).toBe("coverage-only\ncoverage-pr-only");
  });

  it("skips files and logs an earlier scope already covered when widening to everything", async () => {
    await fetch("app-container-logs");
    await fetch("coverage-only");
    vi.clearAllMocks();
    (getTestRunData as Mock).mockResolvedValue(TEST_RUN_DATA);

    await fetch("everything");

    expect(downloadedFiles()).toEqual([
      "coverage.pr.json.gz",
      "coverage-stats.pr.json.gz",
      "diversity-by-replay.json.gz",
    ]);
    expect(getTestRunData).toHaveBeenCalledWith(
      expect.objectContaining({ includeAppContainerLogs: false }),
    );
    expect(downloadAppContainerLogs).not.toHaveBeenCalled();
  });

  it("throws for a pull-request scope whose files the backend withheld", async () => {
    const {
      coveragePr: _coveragePr,
      coverageStatsPr: _coverageStatsPr,
      ...withheld
    } = TEST_RUN_DATA;
    (getTestRunData as Mock).mockResolvedValue(withheld);

    const error = await fetch("coverage-pr-only").catch(
      (thrown: unknown) => thrown,
    );

    expect(isTestRunDataWithheldError(error)).toBe(true);
    expect(downloadedFiles()).toEqual([]);
    expect(existsSync(join(testRunDir(), "downloaded-scopes.txt"))).toBe(false);
  });

  it("downloads the rest of everything when the pull-request files are withheld", async () => {
    const {
      coveragePr: _coveragePr,
      coverageStatsPr: _coverageStatsPr,
      ...withheld
    } = TEST_RUN_DATA;
    (getTestRunData as Mock).mockResolvedValue(withheld);

    await fetch("everything");

    expect(downloadedFiles()).toEqual([
      "coverage.json.gz",
      "coverage-stats.json.gz",
      "diversity-by-replay.json.gz",
    ]);
  });

  it("still throws for a pull-request scope after an everything download whose pull-request files were withheld", async () => {
    (getTestRunData as Mock).mockResolvedValue(WITHHELD_TEST_RUN_DATA);
    await fetch("everything");
    vi.clearAllMocks();
    (getTestRunData as Mock).mockResolvedValue(WITHHELD_TEST_RUN_DATA);

    const error = await fetch("coverage-pr-only").catch(
      (thrown: unknown) => thrown,
    );

    expect(isTestRunDataWithheldError(error)).toBe(true);
    expect(downloadedFiles()).toEqual([]);
  });

  it("serves other scopes from an everything download whose pull-request files were withheld", async () => {
    (getTestRunData as Mock).mockResolvedValue(WITHHELD_TEST_RUN_DATA);
    await fetch("everything");
    vi.clearAllMocks();
    (getTestRunData as Mock).mockResolvedValue(WITHHELD_TEST_RUN_DATA);

    await fetch("coverage-only");
    await fetch("app-container-logs");

    expect(downloadedFiles()).toEqual([]);
    expect(downloadAppContainerLogs).not.toHaveBeenCalled();
  });

  it("fetches only the pull-request files once they are no longer withheld", async () => {
    (getTestRunData as Mock).mockResolvedValue(WITHHELD_TEST_RUN_DATA);
    await fetch("everything");
    vi.clearAllMocks();
    (getTestRunData as Mock).mockResolvedValue(TEST_RUN_DATA);

    await fetch("everything");

    expect(downloadedFiles()).toEqual([
      "coverage.pr.json.gz",
      "coverage-stats.pr.json.gz",
    ]);
    expect(downloadAppContainerLogs).not.toHaveBeenCalled();
    expect(
      readFileSync(join(testRunDir(), "downloaded-scopes.txt"), "utf-8"),
    ).toBe("everything-except-pr\neverything");
  });

  it("downloads latest into the resolved run's directory and reuses it", async () => {
    await runWithLocalDataDir(dataDir, () =>
      getOrFetchTestRunData({} as never, "latest", "coverage-only", "proj"),
    );
    const result = await runWithLocalDataDir(dataDir, () =>
      getOrFetchTestRunData({} as never, "latest", "coverage-only", "proj"),
    );

    expect(result.fileName).toBe(testRunDir());
    expect(downloadedFiles()).toEqual([
      "coverage.json.gz",
      "coverage-stats.json.gz",
    ]);
    expect(getTestRunData).toHaveBeenCalledWith(
      expect.objectContaining({ testRunId: "latest", project: "proj" }),
    );
  });

  it("ignores, and keeps, a scope recorded by a newer version", async () => {
    await mkdir(testRunDir(), { recursive: true });
    await writeFile(
      join(testRunDir(), "downloaded-scopes.txt"),
      "some-future-scope\ncoverage-only",
    );

    await fetch("coverage-only");
    await fetch("coverage-pr-only");

    expect(downloadedFiles()).toEqual([
      "coverage.pr.json.gz",
      "coverage-stats.pr.json.gz",
    ]);
    expect(
      readFileSync(join(testRunDir(), "downloaded-scopes.txt"), "utf-8"),
    ).toBe("some-future-scope\ncoverage-only\ncoverage-pr-only");
  });

  it("honours the single-scope marker written by older versions", async () => {
    await mkdir(testRunDir(), { recursive: true });
    await writeFile(
      join(testRunDir(), "previously-downloaded.txt"),
      "everything",
    );

    await fetch("coverage-pr-only");

    expect(downloadedFiles()).toEqual([]);
  });
});
