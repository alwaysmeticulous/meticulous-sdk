import type { TestRunCoverageFile } from "@alwaysmeticulous/client";
import { describe, expect, it } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import {
  assertTestRunOnlyFlagsUnsetForReplay,
  coverageColumnValue,
  coverageFileToJson,
  determineColumns,
  isAmbiguousTestRunError,
  parseHeadPlusTestRunIds,
  parseTestRunIds,
  type Options,
} from "./js-coverage.command";

const baseOptions = (overrides: Partial<Options> = {}): Options => ({
  apiToken: undefined,
  replayId: undefined,
  testRunId: undefined,
  commitSha: undefined,
  screenshotName: undefined,
  dontWaitForTestRunToComplete: false,
  includeExecutedRanges: false,
  includeExecutableRanges: false,
  includeUncoveredRanges: false,
  includeCoveragePercentage: false,
  includeAllFiles: false,
  prDiffOnly: false,
  globFilter: undefined,
  headPlusTestRunIds: undefined,
  testRunIds: undefined,
  json: false,
  ...overrides,
});

describe("determineColumns", () => {
  it("defaults to executed ranges when no column flag is given", () => {
    expect(determineColumns(baseOptions())).toEqual(["executedRanges"]);
  });

  it("omits the executed default once another column is requested", () => {
    expect(
      determineColumns(baseOptions({ includeCoveragePercentage: true })),
    ).toEqual(["coveragePercentage"]);
  });

  it("keeps executed ranges when explicitly requested alongside others", () => {
    expect(
      determineColumns(
        baseOptions({
          includeExecutedRanges: true,
          includeUncoveredRanges: true,
        }),
      ),
    ).toEqual(["executedRanges", "uncoveredRanges"]);
  });

  it("emits every column in the fixed order", () => {
    expect(
      determineColumns(
        baseOptions({
          includeCoveragePercentage: true,
          includeUncoveredRanges: true,
          includeExecutableRanges: true,
          includeExecutedRanges: true,
        }),
      ),
    ).toEqual([
      "executedRanges",
      "executableRanges",
      "uncoveredRanges",
      "coveragePercentage",
    ]);
  });
});

describe("assertTestRunOnlyFlagsUnsetForReplay", () => {
  it("rejects a whole-test-run-only column flag", () => {
    expect(() =>
      assertTestRunOnlyFlagsUnsetForReplay(
        baseOptions({ includeExecutableRanges: true }),
      ),
    ).toThrow(CliUserError);
  });

  it("rejects --prDiffOnly", () => {
    expect(() =>
      assertTestRunOnlyFlagsUnsetForReplay(baseOptions({ prDiffOnly: true })),
    ).toThrow(/--prDiffOnly only appl/);
  });

  it("lists every offending flag", () => {
    expect(() =>
      assertTestRunOnlyFlagsUnsetForReplay(
        baseOptions({
          includeUncoveredRanges: true,
          includeCoveragePercentage: true,
        }),
      ),
    ).toThrow(/--includeUncoveredRanges, --includeCoveragePercentage/);
  });

  it("allows executed ranges, --globFilter and --includeAllFiles on a replay", () => {
    expect(() =>
      assertTestRunOnlyFlagsUnsetForReplay(
        baseOptions({
          includeExecutedRanges: true,
          includeAllFiles: true,
          globFilter: "src/**",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects --headPlusTestRunIds", () => {
    expect(() =>
      assertTestRunOnlyFlagsUnsetForReplay(
        baseOptions({ headPlusTestRunIds: "tr-2,tr-3" }),
      ),
    ).toThrow(/--headPlusTestRunIds only appl/);
  });

  it("rejects --testRunIds", () => {
    expect(() =>
      assertTestRunOnlyFlagsUnsetForReplay(
        baseOptions({ testRunIds: "tr-1,tr-2,tr-3" }),
      ),
    ).toThrow(/--testRunIds only appl/);
  });
});

describe("parseHeadPlusTestRunIds", () => {
  it("returns an empty list when omitted", () => {
    expect(parseHeadPlusTestRunIds(undefined)).toEqual([]);
  });

  it("splits and trims a comma-separated list", () => {
    expect(parseHeadPlusTestRunIds("tr-2, tr-3 ,tr-4")).toEqual([
      "tr-2",
      "tr-3",
      "tr-4",
    ]);
  });

  it("dedupes repeated IDs", () => {
    expect(parseHeadPlusTestRunIds("tr-2,tr-3,tr-2")).toEqual(["tr-2", "tr-3"]);
  });

  it("rejects an explicitly-empty list", () => {
    expect(() => parseHeadPlusTestRunIds("")).toThrow(CliUserError);
    expect(() => parseHeadPlusTestRunIds(",,,")).toThrow(CliUserError);
  });
});

describe("parseTestRunIds", () => {
  it("returns a single-element list for one ID", () => {
    expect(parseTestRunIds("tr-1")).toEqual(["tr-1"]);
  });

  it("splits and trims a comma-separated list, keeping the first as primary", () => {
    expect(parseTestRunIds("tr-1, tr-2 ,tr-3")).toEqual([
      "tr-1",
      "tr-2",
      "tr-3",
    ]);
  });

  it("does not dedupe (unlike parseHeadPlusTestRunIds) — the first ID's position matters", () => {
    expect(parseTestRunIds("tr-1,tr-2,tr-1")).toEqual(["tr-1", "tr-2", "tr-1"]);
  });

  it("rejects an explicitly-empty list", () => {
    expect(() => parseTestRunIds("")).toThrow(CliUserError);
    expect(() => parseTestRunIds(",,,")).toThrow(CliUserError);
  });
});

describe("coverageColumnValue", () => {
  const file: TestRunCoverageFile = {
    repoFilePath: "src/a.ts",
    executedRanges: [[1, 2]],
    executableRanges: [[1, 5]],
    uncoveredRanges: [[3, 5]],
    coveragePercentage: 40,
  };

  it("returns the raw ranges for each range column", () => {
    expect(coverageColumnValue(file, "executedRanges")).toEqual([[1, 2]]);
    expect(coverageColumnValue(file, "executableRanges")).toEqual([[1, 5]]);
    expect(coverageColumnValue(file, "uncoveredRanges")).toEqual([[3, 5]]);
  });

  it("returns the numeric percentage (not the TSV-formatted string)", () => {
    expect(coverageColumnValue(file, "coveragePercentage")).toBe(40);
  });

  it("falls back to [] for a missing range column", () => {
    expect(
      coverageColumnValue({ repoFilePath: "src/b.ts" }, "executedRanges"),
    ).toEqual([]);
  });

  it("returns null for a null/absent coveragePercentage", () => {
    expect(
      coverageColumnValue(
        { repoFilePath: "src/b.ts", coveragePercentage: null },
        "coveragePercentage",
      ),
    ).toBeNull();
    expect(
      coverageColumnValue({ repoFilePath: "src/b.ts" }, "coveragePercentage"),
    ).toBeNull();
  });
});

describe("coverageFileToJson", () => {
  it("builds repoFilePath plus the requested columns, in structured form", () => {
    const file: TestRunCoverageFile = {
      repoFilePath: "src/a.ts",
      executedRanges: [[1, 2]],
      coveragePercentage: 40,
    };
    expect(
      coverageFileToJson(file, ["executedRanges", "coveragePercentage"]),
    ).toEqual({
      repoFilePath: "src/a.ts",
      executedRanges: [[1, 2]],
      coveragePercentage: 40,
    });
  });

  it("keeps a null coveragePercentage as null (rather than the 'n/a' TSV string)", () => {
    expect(
      coverageFileToJson(
        { repoFilePath: "src/b.ts", coveragePercentage: null },
        ["coveragePercentage"],
      ),
    ).toEqual({ repoFilePath: "src/b.ts", coveragePercentage: null });
  });

  it("emits only repoFilePath when no columns are requested", () => {
    expect(coverageFileToJson({ repoFilePath: "src/c.ts" }, [])).toEqual({
      repoFilePath: "src/c.ts",
    });
  });
});

describe("isAmbiguousTestRunError", () => {
  it("detects the ambiguous-test-run reason on a fetch error", () => {
    expect(
      isAmbiguousTestRunError({
        response: { data: { reason: "ambiguous-test-run" } },
      }),
    ).toBe(true);
  });

  it("is false for a fetch error with a different reason", () => {
    expect(
      isAmbiguousTestRunError({
        response: { data: { reason: "no-coverage-indexed" } },
      }),
    ).toBe(false);
  });

  it("is false for a non-fetch error", () => {
    expect(isAmbiguousTestRunError(new Error("boom"))).toBeFalsy();
  });
});
