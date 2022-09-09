import { TestCase, TestCaseResult } from "../config/config.types";

export const sortResults: (options: {
  results: TestCaseResult[];
  testCases: TestCase[];
}) => TestCaseResult[] = ({ results: unsorted_, testCases }) => {
  const unsorted = [...unsorted_];
  const results: TestCaseResult[] = [];

  testCases.forEach(({ title, baseReplayId, sessionId }) => {
    const idx = unsorted.findIndex(
      (result) =>
        result.title === title &&
        result.baseReplayId === baseReplayId &&
        result.sessionId === sessionId
    );
    if (idx == -1) {
      return;
    }
    results.push(unsorted[idx]);
    unsorted.splice(idx, 1);
  });

  results.push(...unsorted);

  return results;
};

export const getTestsToRun: (options: {
  testCases: TestCase[];
  cachedTestRunResults: TestCaseResult[];
}) => TestCase[] = ({ testCases, cachedTestRunResults }) =>
  testCases.filter(
    ({ sessionId, baseReplayId, title }) =>
      !cachedTestRunResults.find(
        (cached) =>
          cached.sessionId === sessionId &&
          cached.baseReplayId === baseReplayId &&
          cached.title === title
      )
  );
