import { describe, expect, it } from "vitest";
import { shouldDownloadTestRunFile } from "../test-runs";

const TEST_RUN_DATA_FILE_TYPES = [
  "coverage",
  "coverageStats",
  "coveragePr",
  "coverageStatsPr",
  "coverageReplaysByFile",
  "coverageReplaysByFileUnmapped",
  "coverageReplaysByFileUnmappedWithRanges",
  "coverageScreenshotReplaysByFile",
  "coverageScreenshotReplaysByFileUnmapped",
  "coverageByReplayPr",
  "diversityByReplay",
  "relevantReplayContexts",
] as const;

describe("shouldDownloadTestRunFile", () => {
  it("downloads coverage.json and coverage-stats.json for coverage-only", () => {
    expect(shouldDownloadTestRunFile("coverage", "coverage-only")).toBe(true);
    expect(shouldDownloadTestRunFile("coverageStats", "coverage-only")).toBe(
      true,
    );

    for (const fileType of TEST_RUN_DATA_FILE_TYPES) {
      if (fileType === "coverage" || fileType === "coverageStats") {
        continue;
      }
      expect(shouldDownloadTestRunFile(fileType, "coverage-only")).toBe(false);
    }
  });

  it("downloads PR coverage files for coverage-pr-only", () => {
    expect(shouldDownloadTestRunFile("coveragePr", "coverage-pr-only")).toBe(
      true,
    );
    expect(
      shouldDownloadTestRunFile("coverageStatsPr", "coverage-pr-only"),
    ).toBe(true);

    for (const fileType of TEST_RUN_DATA_FILE_TYPES) {
      if (fileType === "coveragePr" || fileType === "coverageStatsPr") {
        continue;
      }
      expect(shouldDownloadTestRunFile(fileType, "coverage-pr-only")).toBe(
        false,
      );
    }
  });

  it("downloads only coverageByReplayPr for coverage-by-replay-pr-only", () => {
    expect(
      shouldDownloadTestRunFile(
        "coverageByReplayPr",
        "coverage-by-replay-pr-only",
      ),
    ).toBe(true);
    expect(
      shouldDownloadTestRunFile("coverage", "coverage-by-replay-pr-only"),
    ).toBe(false);
  });

  it("downloads all files for everything", () => {
    for (const fileType of TEST_RUN_DATA_FILE_TYPES) {
      expect(shouldDownloadTestRunFile(fileType, "everything")).toBe(true);
    }
  });

  it("downloads no test-run data files for app-container-logs", () => {
    for (const fileType of TEST_RUN_DATA_FILE_TYPES) {
      expect(shouldDownloadTestRunFile(fileType, "app-container-logs")).toBe(
        false,
      );
    }
  });
});
