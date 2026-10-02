import { describe, expect, it } from "vitest";
import { assertSingleRunSelector } from "./pr-number-option";

describe("assertSingleRunSelector", () => {
  const none = {
    testRunId: undefined,
    prNumber: undefined,
    commitSha: undefined,
  };

  it.each([
    [none],
    [{ ...none, testRunId: "tr-1" }],
    [{ ...none, prNumber: 42 }],
    [{ ...none, commitSha: "abc123" }],
  ])("accepts at most one selector (%o)", (selectors) => {
    expect(() => assertSingleRunSelector(selectors)).not.toThrow();
  });

  it.each([
    [{ ...none, testRunId: "tr-1", prNumber: 42 }],
    [{ ...none, prNumber: 42, commitSha: "abc123" }],
    [{ testRunId: "tr-1", prNumber: 42, commitSha: "abc123" }],
  ])("rejects more than one (%o)", (selectors) => {
    expect(() => assertSingleRunSelector(selectors)).toThrow(
      "Pass only one of --testRunId, --prNumber and --commitSha.",
    );
  });
});
