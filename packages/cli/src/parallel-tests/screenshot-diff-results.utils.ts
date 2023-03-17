import { ScreenshotDiffResult } from "@alwaysmeticulous/api";
import { DetailedTestCaseResult } from "../config/config.types";

export type ScreenshotDiffResultWithBaseReplayId = ScreenshotDiffResult & {
  baseReplayId: string;
};

export const flattenScreenshotDiffResults = (
  testCaseResult: DetailedTestCaseResult
): ScreenshotDiffResultWithBaseReplayId[] => {
  return [
    ...testCaseResult.screenshotDiffResultsByBaseReplayId.entries(),
  ].flatMap(([baseReplayId, diffs]) => {
    return diffs.map((diff) => ({ ...diff, baseReplayId }));
  });
};

export const groupScreenshotDiffResults = (
  results: ScreenshotDiffResultWithBaseReplayId[]
): Map<string, ScreenshotDiffResult[]> => {
  const groupedResults = new Map<string, ScreenshotDiffResult[]>();
  results.forEach(({ baseReplayId, ...result }) => {
    const resultsForBaseReplayId = groupedResults.get(baseReplayId) ?? [];
    resultsForBaseReplayId.push(result);
    groupedResults.set(baseReplayId, resultsForBaseReplayId);
  });
  return groupedResults;
};
