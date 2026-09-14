import type {
  MeticulousClient,
  ProjectJsCoverageResponse,
  TestRunCoverageFile,
} from "@alwaysmeticulous/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import yargs, { type Options as YargsOptions } from "yargs";
import { CliUserError } from "../../utils/cli-user-error";
import {
  COVERAGE_COLUMN_FLAG,
  formatCoverageColumn,
} from "./coverage-columns.util";
import { formatCoverageSummary } from "./coverage-summary.util";
import {
  assertLatestForProjectCompatible,
  assertSummaryCompatible,
  assertTestRunCoverageResolvable,
  assertTestRunOnlyFlagsUnsetForReplay,
  buildProjectCoverageRequestOptions,
  canAnchorReplayCoverage,
  coverageColumnValue,
  coverageFileToJson,
  determineColumns,
  isAmbiguousTestRunError,
  jsCoverageCommand,
  parseHeadPlusTestRunIds,
  parseTestRunIds,
  printProjectCoverage,
  type Options,
} from "./js-coverage.command";

const mocks = vi.hoisted(() => ({
  logNotice: vi.fn(),
  initLogger: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  initLogger: mocks.initLogger,
}));

const baseOptions = (overrides: Partial<Options> = {}): Options => ({
  apiToken: undefined,
  latestForProject: false,
  replayId: undefined,
  testRunId: undefined,
  commitSha: undefined,
  screenshotName: undefined,
  dontWaitForTestRunToComplete: false,
  includeExecutedRanges: false,
  includeExecutableRanges: false,
  includeUncoveredRanges: false,
  includeLineCounts: false,
  includeCoveragePercentage: false,
  orderBy: undefined,
  order: undefined,
  limit: undefined,
  offset: undefined,
  includeAllFiles: false,
  prDiffOnly: false,
  summary: false,
  globFilter: undefined,
  headPlusTestRunIds: undefined,
  testRunIds: undefined,
  json: false,
  project: undefined,
  ...overrides,
});

describe("canAnchorReplayCoverage", () => {
  it.each(["Success", "Failure"] as const)("accepts %s", (status) => {
    expect(canAnchorReplayCoverage(status)).toBe(true);
  });

  // Base runs are the common case for a default-branch checkout, and their
  // clone-and-parse artifact maps a replay's paths just as well as a completed
  // run's — the --replayId disambiguation fallback relies on this, even though
  // the same run's own coverage total is rejected below.
  it("accepts a Partial base run", () => {
    expect(canAnchorReplayCoverage("Partial")).toBe(true);
  });

  it.each([
    "Scheduled",
    "PreProcessing",
    "Running",
    "PostProcessing",
    "Aborted",
    "ExecutionError",
  ] as const)("rejects %s", (status) => {
    expect(canAnchorReplayCoverage(status)).toBe(false);
  });
});

describe("assertTestRunCoverageResolvable", () => {
  it.each(["Success", "Failure"] as const)(
    "does not throw for %s",
    (status) => {
      expect(() =>
        assertTestRunCoverageResolvable("tr-1", status),
      ).not.toThrow();
    },
  );

  // Whether a base run's own coverage describes its commit depends on how much
  // of its selected set has replayed, which only the backend knows — so this no
  // longer rejects Partial client-side and lets the backend decide.
  it("does not throw for Partial", () => {
    expect(() =>
      assertTestRunCoverageResolvable("tr-1", "Partial"),
    ).not.toThrow();
  });

  // Throw-only: an accepted run's results speak for themselves, and a rejected
  // one gets an error rather than a notice it then contradicts.
  it.each(["Success", "Failure", "Partial"] as const)(
    "emits no notice for %s",
    (status) => {
      mocks.logNotice.mockClear();
      assertTestRunCoverageResolvable("tr-1", status);
      expect(mocks.logNotice).not.toHaveBeenCalled();
    },
  );

  it.each(["Aborted", "ExecutionError"] as const)(
    "still throws for %s",
    (status) => {
      expect(() => assertTestRunCoverageResolvable("tr-1", status)).toThrow(
        /finished unsuccessfully/,
      );
    },
  );

  it("still throws for an in-progress run", () => {
    expect(() => assertTestRunCoverageResolvable("tr-1", "Running")).toThrow(
      /coverage not yet available/,
    );
  });
});

describe("--summary", () => {
  it("allows run selection, --json and --dontWaitForTestRunToComplete", () => {
    expect(() =>
      assertSummaryCompatible(
        baseOptions({
          summary: true,
          testRunIds: "tr-1,tr-2",
          project: "org/project",
          dontWaitForTestRunToComplete: true,
          json: true,
        }),
      ),
    ).not.toThrow();
  });

  it("allows --latestForProject", () => {
    expect(() =>
      assertSummaryCompatible(
        baseOptions({ summary: true, latestForProject: true }),
      ),
    ).not.toThrow();
    expect(() =>
      assertLatestForProjectCompatible(
        baseOptions({ summary: true, latestForProject: true }),
      ),
    ).not.toThrow();
  });

  it("rejects the column flags", () => {
    expect(() =>
      assertSummaryCompatible(
        baseOptions({
          summary: true,
          includeExecutedRanges: true,
          includeCoveragePercentage: true,
        }),
      ),
    ).toThrow(/--includeExecutedRanges, --includeCoveragePercentage/);
  });

  it("rejects the row filters, whose subsetting is what the summary avoids", () => {
    expect(() =>
      assertSummaryCompatible(
        baseOptions({
          summary: true,
          includeAllFiles: true,
          globFilter: ["src/**"],
          prDiffOnly: true,
        }),
      ),
    ).toThrow(/--includeAllFiles, --globFilter, --prDiffOnly/);
  });

  it("rejects a single replay, which has no executable-line data", () => {
    expect(() =>
      assertSummaryCompatible(baseOptions({ summary: true, replayId: "r-1" })),
    ).toThrow(/--replayId/);
  });

  it("rejects the line-counts column", () => {
    expect(() =>
      assertSummaryCompatible(
        baseOptions({ summary: true, includeLineCounts: true }),
      ),
    ).toThrow(/--includeLineCounts/);
  });

  // The summary is one row of totals, so there is nothing to order or page.
  it("rejects the ordering and paging options", () => {
    expect(() =>
      assertSummaryCompatible(
        baseOptions({
          summary: true,
          orderBy: "executedLines",
          order: "asc",
          limit: 10,
          offset: 20,
        }),
      ),
    ).toThrow(/--orderBy, --order, --limit, --offset/);
  });

  // A zero is still a value the caller passed, and would still be ignored
  // alongside --summary, so it is rejected rather than treated as unset. (The
  // option coercers reject a zero `--limit` outright; this guards the
  // combination independently of them.)
  it("rejects an explicit zero limit or offset", () => {
    expect(() =>
      assertSummaryCompatible(baseOptions({ summary: true, limit: 0 })),
    ).toThrow(/--limit/);
    expect(() =>
      assertSummaryCompatible(baseOptions({ summary: true, offset: 0 })),
    ).toThrow(/--offset/);
  });

  it("does nothing when --summary is not set", () => {
    expect(() =>
      assertSummaryCompatible(
        baseOptions({ includeExecutedRanges: true, globFilter: ["src/**"] }),
      ),
    ).not.toThrow();
  });
});

describe("formatCoverageSummary", () => {
  const summary = {
    testRunId: "tr-1",
    commitSha: "abc123",
    executionSha: "def456",
    files: 8214,
    executedLines: 96388,
    executableLines: 135281,
    uncoveredLines: 38893,
    coveragePercentage: 71.25016,
  };

  it("emits key:\\tvalue lines in field order, percentage to one decimal", () => {
    expect(formatCoverageSummary(summary)).toEqual([
      "testRunId:\ttr-1",
      "commitSha:\tabc123",
      "executionSha:\tdef456",
      "files:\t8214",
      "executedLines:\t96388",
      "executableLines:\t135281",
      "uncoveredLines:\t38893",
      "coveragePercentage:\t71.3",
    ]);
  });

  it("emits the parse-failure fields when present", () => {
    expect(
      formatCoverageSummary({
        ...summary,
        filesFailedToParse: 137,
        coveragePercentageMax: 73.4712,
      }),
    ).toEqual([
      "testRunId:\ttr-1",
      "commitSha:\tabc123",
      "executionSha:\tdef456",
      "files:\t8214",
      "filesFailedToParse:\t137",
      "executedLines:\t96388",
      "executableLines:\t135281",
      "uncoveredLines:\t38893",
      "coveragePercentage:\t71.3",
      "coveragePercentageMax:\t73.5",
    ]);
  });

  it("omits the percentage line entirely when there are no executable lines", () => {
    const lines = formatCoverageSummary({
      ...summary,
      files: 0,
      executedLines: 0,
      executableLines: 0,
      uncoveredLines: 0,
      coveragePercentage: null,
    });
    expect(lines).toContain("files:\t0");
    expect(lines.some((line) => line.startsWith("coveragePercentage:"))).toBe(
      false,
    );
  });
});

describe("--latestForProject", () => {
  it("allows project selection and coverage output options", () => {
    expect(() =>
      assertLatestForProjectCompatible(
        baseOptions({
          latestForProject: true,
          project: "org/project",
          includeCoveragePercentage: true,
          globFilter: ["src/**"],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects explicit run selection and test-run-only modifiers", () => {
    expect(() =>
      assertLatestForProjectCompatible(
        baseOptions({
          latestForProject: true,
          testRunId: "tr-1",
          prDiffOnly: true,
        }),
      ),
    ).toThrow(/--testRunId, --prDiffOnly/);
  });

  it("builds a project request with the default executed-ranges column", () => {
    const options = baseOptions({
      latestForProject: true,
      project: "org/project",
    });
    expect(
      buildProjectCoverageRequestOptions(options, determineColumns(options)),
    ).toEqual({
      includeAllFiles: false,
      project: "org/project",
      includeExecutedRanges: true,
    });
  });

  // Regression test for a real bug: yargs' `conflicts` treats an option as
  // "present" once it has a value, including its default. latestForProject,
  // prDiffOnly, and dontWaitForTestRunToComplete all default to false, so a
  // yargs-level `conflicts` between them would reject every invocation —
  // including a bare `js-coverage` with no flags at all — before the handler
  // (and assertLatestForProjectCompatible) ever runs. Parse through the real
  // yargs builder (unlike the other tests above, which call
  // assertLatestForProjectCompatible directly) so this class of bug can't
  // silently come back.
  it("does not reject a bare invocation at the yargs parsing layer", () => {
    expect(() =>
      yargs([])
        .options(jsCoverageCommand.builder as Record<string, YargsOptions>)
        .fail((msg) => {
          throw new Error(msg);
        })
        .parse(),
    ).not.toThrow();
  });

  it("does not reject an explicit --testRunId at the yargs parsing layer", () => {
    expect(() =>
      yargs(["--testRunId", "tr-1"])
        .options(jsCoverageCommand.builder as Record<string, YargsOptions>)
        .fail((msg) => {
          throw new Error(msg);
        })
        .parse(),
    ).not.toThrow();
  });
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
          globFilter: ["src/**"],
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

describe("printProjectCoverage", () => {
  let logged: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((line: string) => {
    logged.push(line);
  });

  afterEach(() => {
    logged = [];
    spy.mockClear();
  });

  const client = {} as MeticulousClient;

  it("prints the same coverage rows as explicit test-run mode", async () => {
    const result: ProjectJsCoverageResponse = {
      testRunId: "tr-9",
      files: [
        {
          repoFilePath: "src/a.ts",
          executedRanges: [[1, 2]],
          coveragePercentage: 40,
        },
      ],
      totalFiles: 1,
    };
    await printProjectCoverage(
      client,
      undefined,
      result,
      ["executedRanges", "coveragePercentage"],
      false,
    );
    expect(logged).toEqual([
      "repoFilePath\texecutedRanges\tcoveragePercentage",
      "src/a.ts\t1-2\t40.0",
    ]);
  });

  it("prints an empty JSON list when no run can be resolved", async () => {
    await printProjectCoverage(
      client,
      undefined,
      { testRunId: null, files: [], totalFiles: 0 },
      ["executedRanges"],
      true,
    );
    expect(JSON.parse(logged.join("\n"))).toEqual([]);
  });

  // --latestForProject always resolves the project's own latest successful
  // run, not any particular commit — the notice must say which commit that
  // was so a caller doesn't mistake it for their own.
  it("names the resolved commit in the notice", async () => {
    await printProjectCoverage(
      client,
      undefined,
      { testRunId: "tr-9", commitSha: "abc123", files: [], totalFiles: 0 },
      ["executedRanges"],
      false,
    );
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Resolved project coverage to test run tr-9 (commit abc123)",
    );
  });

  it("omits the commit parenthetical when commitSha is absent", async () => {
    await printProjectCoverage(
      client,
      undefined,
      { testRunId: "tr-9", files: [], totalFiles: 0 },
      ["executedRanges"],
      false,
    );
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Resolved project coverage to test run tr-9",
    );
  });

  // The backend now serves a base run whose selected set hasn't fully replayed
  // rather than refusing it, and states the shortfall in `notes`. Relayed
  // verbatim: keeping a second copy of the wording here is how the CLI and MCP
  // surfaces drift apart.
  it("relays the backend's notes to stderr", async () => {
    await printProjectCoverage(
      client,
      undefined,
      {
        testRunId: "tr-9",
        files: [],
        totalFiles: 0,
        notes: ["Note: 2 of its 40 selected sessions have not run."],
      },
      ["executedRanges"],
      false,
    );
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Note: 2 of its 40 selected sessions have not run.",
    );
  });

  it("logs nothing extra when there are no notes", async () => {
    mocks.logNotice.mockClear();

    await printProjectCoverage(
      client,
      undefined,
      { testRunId: "tr-9", files: [], totalFiles: 0 },
      ["executedRanges"],
      false,
    );

    // Just the one it always logs: the resolved run. The file count now
    // arrives as a backend note, and a response with none says nothing.
    expect(mocks.logNotice).toHaveBeenCalledTimes(1);
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

describe("line-count columns", () => {
  it("emits all three columns from the one flag, after the ranges", () => {
    expect(determineColumns(baseOptions({ includeLineCounts: true }))).toEqual([
      "executedLines",
      "executableLines",
      "uncoveredLines",
    ]);
  });

  it("does not fall back to executedRanges when only counts are asked for", () => {
    expect(
      determineColumns(baseOptions({ includeLineCounts: true })),
    ).not.toContain("executedRanges");
  });

  it("keeps the fixed order alongside the other columns", () => {
    expect(
      determineColumns(
        baseOptions({
          includeCoveragePercentage: true,
          includeLineCounts: true,
          includeExecutedRanges: true,
        }),
      ),
    ).toEqual([
      "executedRanges",
      "executedLines",
      "executableLines",
      "uncoveredLines",
      "coveragePercentage",
    ]);
  });

  // Counts are integers; only the percentage gets a decimal place.
  it("formats counts as integers and the percentage to one decimal", () => {
    const file: TestRunCoverageFile = {
      repoFilePath: "src/a.ts",
      executedLines: 3,
      executableLines: 7,
      uncoveredLines: 4,
      coveragePercentage: 42.857,
    };
    expect(formatCoverageColumn(file, "executedLines")).toBe("3");
    expect(formatCoverageColumn(file, "uncoveredLines")).toBe("4");
    expect(formatCoverageColumn(file, "coveragePercentage")).toBe("42.9");
  });

  it("maps every count column to the single includeLineCounts request flag", () => {
    expect(COVERAGE_COLUMN_FLAG.executedLines).toBe("includeLineCounts");
    expect(COVERAGE_COLUMN_FLAG.executableLines).toBe("includeLineCounts");
    expect(COVERAGE_COLUMN_FLAG.uncoveredLines).toBe("includeLineCounts");
  });
});

describe("ordering and paging options", () => {
  it("sends them only when set, so an absent limit means the server default", () => {
    const options = baseOptions({
      latestForProject: true,
      includeLineCounts: true,
    });
    const request = buildProjectCoverageRequestOptions(
      options,
      determineColumns(options),
    );
    expect(request).not.toHaveProperty("orderBy");
    expect(request).not.toHaveProperty("order");
    expect(request).not.toHaveProperty("limit");
    expect(request).not.toHaveProperty("offset");
  });

  it("passes them through when set", () => {
    const options = baseOptions({
      latestForProject: true,
      includeLineCounts: true,
      orderBy: "uncoveredLines",
      order: "asc",
      limit: 25,
      offset: 50,
    });
    expect(
      buildProjectCoverageRequestOptions(options, determineColumns(options)),
    ).toEqual(
      expect.objectContaining({
        orderBy: "uncoveredLines",
        order: "asc",
        limit: 25,
        offset: 50,
        includeLineCounts: true,
      }),
    );
  });

  // limit 0 is how a caller asks for everything, so it must not be dropped as
  // falsy on the way out.
  it("sends an explicit limit of 0", () => {
    const options = baseOptions({ latestForProject: true, limit: 0 });
    expect(
      buildProjectCoverageRequestOptions(options, determineColumns(options)),
    ).toEqual(expect.objectContaining({ limit: 0 }));
  });

  it("passes several globs through as an array", () => {
    const options = baseOptions({
      latestForProject: true,
      globFilter: ["src/**", "libs/**"],
    });
    expect(
      buildProjectCoverageRequestOptions(options, determineColumns(options)),
    ).toEqual(expect.objectContaining({ globFilter: ["src/**", "libs/**"] }));
  });

  it("rejects the whole-test-run-only options for a single replay", () => {
    expect(() =>
      assertTestRunOnlyFlagsUnsetForReplay(
        baseOptions({
          replayId: "r-1",
          includeLineCounts: true,
          orderBy: "uncoveredLines",
          limit: 10,
          offset: 5,
        }),
      ),
    ).toThrow(/--includeLineCounts, --orderBy, --limit, --offset/);
  });

  // --limit deliberately has no yargs default: one would make every
  // invocation look like it had passed the flag, so a replay request could
  // never be told apart from an explicit --limit (the same trap
  // --latestForProject's own checks document).
  it("leaves limit and offset unset when the flags are not passed", () => {
    const parsed = yargs([])
      .command(
        jsCoverageCommand.command as string,
        jsCoverageCommand.describe as string,
        jsCoverageCommand.builder as Record<string, YargsOptions>,
      )
      .parse("js-coverage") as Record<string, unknown>;
    expect(parsed.limit).toBeUndefined();
    expect(parsed.offset).toBeUndefined();
    expect(parsed.includeLineCounts).toBe(false);
  });
});
