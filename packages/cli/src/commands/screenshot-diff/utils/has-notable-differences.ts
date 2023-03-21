import { ScreenshotDiffResult } from "@alwaysmeticulous/api";

export const hasNotableDifferences = (
  screenshotDiffResults: ScreenshotDiffResult[]
) => {
  // Note: we ignore flakes & missing-bases here
  return screenshotDiffResults.some(
    (diff) =>
      diff.outcome === "diff" ||
      diff.outcome === "missing-head" ||
      diff.outcome === "different-size"
  );
};
