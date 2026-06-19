import type { TestRunStatus } from "@alwaysmeticulous/api";
import { describe, expect, test } from "vitest";
import { CliUserError } from "../cli-user-error";
import {
  assertTestRunComplete,
  isTestRunComplete,
  isTestRunFailed,
  isTestRunPartial,
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

describe("isTestRunPartial", () => {
  test.each<[TestRunStatus, boolean]>([
    ["Partial", true],
    ["Success", false],
    ["Failure", false],
    ["Running", false],
    ["Aborted", false],
    ["ExecutionError", false],
  ])("%s -> %s", (status, expected) => {
    expect(isTestRunPartial(status)).toBe(expected);
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

  test("throws 'not complete' for Running", () => {
    expect(() => assertTestRunComplete("tr-1", "Running")).toThrow(CliUserError);
    expect(() => assertTestRunComplete("tr-1", "Running")).toThrow(
      /is not complete/,
    );
  });

  test("throws 'session-pool base run' for Partial", () => {
    expect(() => assertTestRunComplete("tr-1", "Partial")).toThrow(CliUserError);
    expect(() => assertTestRunComplete("tr-1", "Partial")).toThrow(
      /session-pool base run/,
    );
  });

  test("uses the resultName in the not-yet-available message", () => {
    expect(() =>
      assertTestRunComplete("tr-1", "Running", { resultName: "coverage" }),
    ).toThrow(/coverage not yet available/);
  });
});
