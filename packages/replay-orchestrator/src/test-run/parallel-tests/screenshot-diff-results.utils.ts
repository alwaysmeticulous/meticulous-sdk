import { ScreenshotDiffResult } from "@alwaysmeticulous/api";
import { DetailedTestCaseResult } from "./utils/config.types";

export type ScreenshotDiffResultWithBaseReplayId = ScreenshotDiffResult & {
  baseReplayId: string;
};

export const flattenScreenshotDiffResults = (
  testCaseResult: DetailedTestCaseResult
): ScreenshotDiffResultWithBaseReplayId[] => {
  return Object.entries(
    testCaseResult.screenshotDiffResultsByBaseReplayId
  ).flatMap(([baseReplayId, diffs]) => {
    return diffs.map((diff) => ({ ...diff, baseReplayId }));
  });
};

export const groupScreenshotDiffResults = (
  results: ScreenshotDiffResultWithBaseReplayId[]
): Record<string, ScreenshotDiffResult[]> => {
  const groupedResults: Record<string, ScreenshotDiffResult[]> = {};
  results.forEach(({ baseReplayId, ...result }) => {
    const resultsForBaseReplayId = groupedResults[baseReplayId] ?? [];
    resultsForBaseReplayId.push(result);
    groupedResults[baseReplayId] = resultsForBaseReplayId;
  });
  return groupedResults;
};
