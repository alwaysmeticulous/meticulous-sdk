import type { DetailedTestCaseResult } from "@alwaysmeticulous/sdk-bundles-api";

/** A `missing-base` result has no base image, so it isn't evidence of a comparison. */
export const hasBaseScreenshotComparison = (
  result: Pick<DetailedTestCaseResult, "screenshotDiffDataByBaseReplayId">,
): boolean =>
  Object.values(result.screenshotDiffDataByBaseReplayId)
    .flatMap((data) => data.results)
    .some((diff) => diff.outcome !== "missing-base");
