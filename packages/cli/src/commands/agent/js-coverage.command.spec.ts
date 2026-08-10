import type {
  MeticulousClient,
  ProjectJsCoverageResponse,
  TestRunCoverageFile,
} from "@alwaysmeticulous/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import yargs, { type Options as YargsOptions } from "yargs";
import { CliUserError } from "../../utils/cli-user-error";
import {
  assertLatestForProjectCompatible,
  assertPrDiffOnlyCompatible,
  assertTestRunCoverageAvailable,
  assertTestRunOnlyFlagsUnsetForReplay,
  buildProjectCoverageRequestOptions,
  canServeCoverage,
  coverageColumnValue,
  coverageFileToJson,
  determineColumns,
  isAmbiguousTestRunError,
  jsCoverageCommand,
  logBaseRunCoverageNotice,
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
  includeCoveragePercentage: false,
  includeAllFiles: false,
  prDiffOnly: false,
  globFilter: undefined,
  headPlusTestRunIds: undefined,
  testRunIds: undefined,
  json: false,
  project: undefined,
  ...overrides,
});

describe("canServeCoverage", () => {
  it.each(["Success", "Failure"] as const)("accepts %s", (status) => {
    expect(canServeCoverage(status)).toBe(true);
  });

  // Base runs are the common case for a default-branch checkout, and they do
  // have coverage — the --replayId disambiguation fallback relies on this.
  it("accepts a Partial base run", () => {
    expect(canServeCoverage("Partial")).toBe(true);
  });

  it.each([
    "Scheduled",
    "PreProcessing",
    "Running",
    "PostProcessing",
    "Aborted",
    "ExecutionError",
  ] as const)("rejects %s", (status) => {
    expect(canServeCoverage(status)).toBe(false);
  });
});

describe("assertTestRunCoverageAvailable", () => {
  it.each(["Success", "Failure"] as const)(
    "does not throw for %s",
    (status) => {
      expect(() =>
        assertTestRunCoverageAvailable("tr-1", status),
      ).not.toThrow();
    },
  );

  // Coverage is recorded per replay as sessions execute, so a base run that has
  // replayed anything has coverage even though it never reaches a verdict.
  it("accepts Partial rather than throwing", () => {
    expect(() =>
      assertTestRunCoverageAvailable("tr-1", "Partial"),
    ).not.toThrow();
  });

  // Throw-only: the base-run caveat rides with the results (see
  // logBaseRunCoverageNotice), so a run with nothing recorded yet isn't first
  // told its coverage "grows over time" and then handed an error.
  it.each(["Success", "Failure", "Partial"] as const)(
    "emits no notice for %s",
    (status) => {
      mocks.logNotice.mockClear();
      assertTestRunCoverageAvailable("tr-1", status);
      expect(mocks.logNotice).not.toHaveBeenCalled();
    },
  );

  it.each(["Aborted", "ExecutionError"] as const)(
    "still throws for %s",
    (status) => {
      expect(() => assertTestRunCoverageAvailable("tr-1", status)).toThrow(
        /finished unsuccessfully/,
      );
    },
  );

  it("still throws for an in-progress run", () => {
    expect(() => assertTestRunCoverageAvailable("tr-1", "Running")).toThrow(
      /coverage not yet available/,
    );
  });
});

describe("logBaseRunCoverageNotice", () => {
  // Presenting a base run's moving total as a fixed one is the thing this
  // guards against, so the notice is pinned rather than left droppable.
  it("explains each base run involved", () => {
    mocks.logNotice.mockClear();
    logBaseRunCoverageNotice(["tr-1", "tr-2"]);
    expect(mocks.logNotice).toHaveBeenCalledTimes(2);
    expect(mocks.logNotice.mock.calls[0][0]).toMatch(
      /tr-1 is a base run .*grows over time/,
    );
    expect(mocks.logNotice.mock.calls[1][0]).toMatch(/tr-2 is a base run/);
  });

  it("says nothing when no base run is involved", () => {
    mocks.logNotice.mockClear();
    logBaseRunCoverageNotice([]);
    expect(mocks.logNotice).not.toHaveBeenCalled();
  });
});

describe("assertPrDiffOnlyCompatible", () => {
  // A base run has no PR, so coverage.pr.json is written empty for it —
  // scoping to it would read as "nothing covered" rather than "not applicable".
  it("rejects --prDiffOnly for a base run", () => {
    expect(() =>
      assertPrDiffOnlyCompatible(
        "tr-1",
        "Partial",
        baseOptions({ prDiffOnly: true }),
      ),
    ).toThrow(/has no PR diff to scope coverage to/);
  });

  it.each(["Success", "Failure"] as const)(
    "allows --prDiffOnly for %s",
    (status) => {
      expect(() =>
        assertPrDiffOnlyCompatible(
          "tr-1",
          status,
          baseOptions({ prDiffOnly: true }),
        ),
      ).not.toThrow();
    },
  );

  it("ignores a base run when --prDiffOnly is unset", () => {
    expect(() =>
      assertPrDiffOnlyCompatible(
        "tr-1",
        "Partial",
        baseOptions({ prDiffOnly: false }),
      ),
    ).not.toThrow();
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
          globFilter: "src/**",
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
      { testRunId: null, files: [] },
      ["executedRanges"],
      true,
    );
    expect(JSON.parse(logged.join("\n"))).toEqual([]);
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
