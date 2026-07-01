import { describe, expect, it } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import {
  assertTestRunOnlyFlagsUnsetForReplay,
  determineColumns,
  isAmbiguousTestRunError,
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
