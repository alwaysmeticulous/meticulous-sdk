import type { TestRunStatus } from "@alwaysmeticulous/api";
import { describe, expect, test } from "vitest";
import { CliUserError } from "../cli-user-error";
import {
  assertTestRunComplete,
  isTestRunComplete,
  isTestRunFailed,
} from "../resolve-test-run-from-commit";

describe("isTestRunComplete", () => {
  test.each<[TestRunStatus, boolean]>([
    ["Success", true],
    ["Failure", true],
    ["Running", false],
    ["Partial", false],
    ["Aborted", false],
    ["ExecutionError", false],
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
  ])("%s -> %s", (status, expected) => {
    expect(isTestRunFailed(status)).toBe(expected);
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

  test.each<TestRunStatus>(["Running", "Partial"])(
    "throws 'not complete' for %s",
    (status) => {
      expect(() => assertTestRunComplete("tr-1", status)).toThrow(CliUserError);
      expect(() => assertTestRunComplete("tr-1", status)).toThrow(
        /is not complete/,
      );
    },
  );

  test("uses the resultName in the not-yet-available message", () => {
    expect(() =>
      assertTestRunComplete("tr-1", "Running", { resultName: "coverage" }),
    ).toThrow(/coverage not yet available/);
  });
});
