import type { TestRunStatus } from "@alwaysmeticulous/api";
import { describe, expect, test } from "vitest";
import { CliUserError } from "../cli-user-error";
import {
  assertTestRunComplete,
  isSessionPool,
  isTestRunComplete,
  isTestRunDeferred,
  isTestRunFailed,
  isTestRunInProgress,
  isTestRunPartial,
  isTestRunResultsReused,
} from "../resolve-test-run-from-commit";

describe("isTestRunComplete", () => {
  test.each<[TestRunStatus, boolean]>([
    ["Success", true],
    ["Failure", true],
    ["Running", false],
    ["Partial", false],
    ["Aborted", false],
    ["ExecutionError", false],
    ["Skipped", false],
  ])("%s -> %s", (status, expected) => {
    expect(isTestRunComplete(status)).toBe(expected);
  });
});

describe("isTestRunFailed", () => {
  test.each<[TestRunStatus, boolean]>([
    ["Aborted", true],
    ["ExecutionError", true],
    ["Success", false],
    ["Failure", false],
    ["Partial", false],
    ["Running", false],
    ["Skipped", false],
  ])("%s -> %s", (status, expected) => {
    expect(isTestRunFailed(status)).toBe(expected);
  });
});

describe("isTestRunPartial", () => {
  test.each<[TestRunStatus, boolean]>([
    ["Partial", true],
    ["Success", false],
    ["Failure", false],
    ["Running", false],
    ["Aborted", false],
    ["ExecutionError", false],
    ["Skipped", false],
  ])("%s -> %s", (status, expected) => {
    expect(isTestRunPartial(status)).toBe(expected);
  });
});

describe("the states that exist without executing", () => {
  test.each<[TestRunStatus, boolean]>([
    ["Deferred", true],
    ["ResultsReused", false],
    ["Skipped", false],
    ["Success", false],
  ])("isTestRunDeferred(%s) -> %s", (status, expected) => {
    expect(isTestRunDeferred(status)).toBe(expected);
  });

  test.each<[TestRunStatus, boolean]>([
    ["ResultsReused", true],
    ["Deferred", false],
    ["Success", false],
  ])("isTestRunResultsReused(%s) -> %s", (status, expected) => {
    expect(isTestRunResultsReused(status)).toBe(expected);
  });

  // A waiter must stop on them (they are settled — nothing on the platform will
  // move them on) without reporting a pass: neither is `complete`, so every
  // command that needs results goes through assertTestRunComplete's explanation.
  test.each<TestRunStatus>(["Deferred", "ResultsReused"])(
    "%s is neither in progress, complete, nor a fatal failure",
    (status) => {
      expect(isTestRunInProgress(status)).toBe(false);
      expect(isTestRunComplete(status)).toBe(false);
      expect(isTestRunFailed(status)).toBe(false);
    },
  );
});

describe("isSessionPool", () => {
  test("false when configData is undefined", () => {
    expect(isSessionPool(undefined)).toBe(false);
  });

  test("false when arguments is absent", () => {
    expect(isSessionPool({})).toBe(false);
  });

  test("false when isSessionPool is not set", () => {
    expect(isSessionPool({ arguments: {} })).toBe(false);
  });

  test("true for a lazy session-pool base", () => {
    expect(isSessionPool({ arguments: { isSessionPool: true } })).toBe(true);
  });

  // Unlike isNonEagerSessionPool, this draws no eager/non-eager distinction:
  // for diffs/checks/prDiffOnly-coverage, a session-pool run has no
  // meaningful results of its own to serve regardless of eagerness.
  test("also true for an eagerly-executing session-pool run", () => {
    expect(
      isSessionPool({
        arguments: { isSessionPool: true, forceEagerExecution: true },
      }),
    ).toBe(true);
  });
});

describe("assertTestRunComplete", () => {
  test.each<TestRunStatus>(["Success", "Failure"])(
    "does not throw for %s",
    (status) => {
      expect(() => assertTestRunComplete("tr-1", status)).not.toThrow();
    },
  );

  test.each<TestRunStatus>(["Aborted", "ExecutionError"])(
    "throws 'finished unsuccessfully' for %s",
    (status) => {
      expect(() => assertTestRunComplete("tr-1", status)).toThrow(CliUserError);
      expect(() => assertTestRunComplete("tr-1", status)).toThrow(
        /finished unsuccessfully/,
      );
    },
  );

  test("throws a dedicated skipped message for Skipped", () => {
    expect(() => assertTestRunComplete("tr-1", "Skipped")).toThrow(
      CliUserError,
    );
    expect(() => assertTestRunComplete("tr-1", "Skipped")).toThrow(
      /was skipped \(no base test run was found, so nothing ran\)/,
    );
  });

  test("throws 'not complete' for Running", () => {
    expect(() => assertTestRunComplete("tr-1", "Running")).toThrow(
      CliUserError,
    );
    expect(() => assertTestRunComplete("tr-1", "Running")).toThrow(
      /is not complete/,
    );
  });

  // Deliberately not special-cased here: whether a base run is usable depends
  // on what's being fetched, so each command intercepts Partial with its own
  // policy and wording first (test-run-diffs rejects, js-coverage accepts).
  test("does not special-case Partial", () => {
    expect(() => assertTestRunComplete("tr-1", "Partial")).toThrow(
      CliUserError,
    );
    expect(() => assertTestRunComplete("tr-1", "Partial")).toThrow(
      /is not complete \(status: Partial\)/,
    );
  });

  test("explains the deferral, and where to decide, for Deferred", () => {
    expect(() =>
      assertTestRunComplete("tr-1", "Deferred", { resultName: "diffs" }),
    ).toThrow(CliUserError);
    expect(() => assertTestRunComplete("tr-1", "Deferred")).toThrow(
      /was deferred and has not been executed.*reuse the results of an earlier commit/s,
    );
  });

  test("points at the executed run for ResultsReused", () => {
    expect(() => assertTestRunComplete("tr-1", "ResultsReused")).toThrow(
      CliUserError,
    );
    expect(() => assertTestRunComplete("tr-1", "ResultsReused")).toThrow(
      /reuses the results of an earlier commit's test run.*--testRunId/s,
    );
  });

  test("uses the resultName in the not-yet-available message", () => {
    expect(() =>
      assertTestRunComplete("tr-1", "Running", { resultName: "coverage" }),
    ).toThrow(/coverage not yet available/);
  });
});
