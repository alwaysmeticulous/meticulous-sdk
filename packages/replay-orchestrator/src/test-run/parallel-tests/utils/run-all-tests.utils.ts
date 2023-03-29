import { TestCase } from "@alwaysmeticulous/api";
import { DetailedTestCaseResult } from "@alwaysmeticulous/sdk-bundles-api";
import { AxiosInstance } from "axios";

export const mergeTestCases = (
  ...testSuites: (TestCase[] | null | undefined)[]
): TestCase[] => {
  const seenSessionIds = new Set<string>();

  return testSuites.flatMap((testSuite) => {
    if (testSuite == null) {
      return [];
    }
    const newTestCases = testSuite.filter(
      (testCase) => !seenSessionIds.has(testCase.sessionId)
    );
    testSuite.forEach((testCase) => seenSessionIds.add(testCase.sessionId));
    return newTestCases;
  });
};

export const sortResults: (options: {
  results: DetailedTestCaseResult[];
  testCases: TestCase[];
}) => DetailedTestCaseResult[] = ({ results: unsorted_, testCases }) => {
  const unsorted = [...unsorted_];
  const results: DetailedTestCaseResult[] = [];

  testCases.forEach(({ title, baseTestRunId, sessionId }) => {
    const idx = unsorted.findIndex(
      (result) =>
        result.title === title &&
        result.baseTestRunId === baseTestRunId &&
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

export interface GetTestsToRunOptions {
  client: AxiosInstance;
  testCases: TestCase[];

  /**
   * The base commit to compare test results against for test cases that don't have a baseReplayId specified.
   */
  baseCommitSha: string | null;
}
