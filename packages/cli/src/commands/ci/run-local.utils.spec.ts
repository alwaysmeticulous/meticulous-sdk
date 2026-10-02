import type { ScreenshotDiffResult } from "@alwaysmeticulous/api";
import { describe, expect, it } from "vitest";
import { hasBaseScreenshotComparison } from "./run-local.utils";

const resultWithOutcomes = (outcomes: ScreenshotDiffResult["outcome"][]) => ({
  screenshotDiffDataByBaseReplayId: {
    base: {
      results: outcomes.map((outcome) => ({ outcome }) as ScreenshotDiffResult),
    },
  },
});

describe("hasBaseScreenshotComparison", () => {
  it("rejects a result with no paired base replay", () => {
    expect(
      hasBaseScreenshotComparison({ screenshotDiffDataByBaseReplayId: {} }),
    ).toBe(false);
  });

  it("rejects missing-base-only outcomes", () => {
    expect(
      hasBaseScreenshotComparison(resultWithOutcomes(["missing-base"])),
    ).toBe(false);
  });

  it.each(["no-diff", "diff", "different-size", "missing-head"] as const)(
    "accepts an outcome backed by a base screenshot: %s",
    (outcome) => {
      expect(hasBaseScreenshotComparison(resultWithOutcomes([outcome]))).toBe(
        true,
      );
    },
  );

  it("accepts a real comparison alongside missing-base outcomes", () => {
    expect(
      hasBaseScreenshotComparison(
        resultWithOutcomes(["missing-base", "no-diff"]),
      ),
    ).toBe(true);
  });
});
