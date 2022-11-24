import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { getLatestTestRunResults } from "../api/test-run.api";
import {
  DetailedTestCaseResult,
  TestCase,
  TestCaseResult,
} from "../config/config.types";

export const sortResults: (options: {
  results: DetailedTestCaseResult[];
  testCases: TestCase[];
}) => DetailedTestCaseResult[] = ({ results: unsorted_, testCases }) => {
  const unsorted = [...unsorted_];
  const results: DetailedTestCaseResult[] = [];

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

export interface GetTestsToRunOptions {
  client: AxiosInstance;
  testCases: TestCase[];
  cachedTestRunResults: TestCaseResult[];

  /**
   * The base commit to compare test results against for test cases that don't have a baseReplayId specified.
   */
  baseCommitSha: string | null;
}

export const getTestsToRun = async ({
  testCases,
  cachedTestRunResults,
  client,
  baseCommitSha,
}: GetTestsToRunOptions): Promise<TestCase[]> => {
  const uncachedTestCases = testCases.filter(
    ({ sessionId, baseReplayId, title }) =>
      !cachedTestRunResults.find(
        (cached) =>
          cached.sessionId === sessionId &&
          cached.baseReplayId === baseReplayId &&
          cached.title === title
      )
  );

  const testCasesMissingBaseReplayId = uncachedTestCases.filter(
    (testCase) => testCase.baseReplayId == null
  );
  const testCasesWithBaseReplayId = uncachedTestCases.flatMap(
    (testCase): TestCase[] => (testCase.baseReplayId == null ? [] : [testCase])
  );

  if (testCasesMissingBaseReplayId.length === 0) {
    return testCasesWithBaseReplayId;
  }

  if (baseCommitSha == null) {
    const namesOfInvalidTests = testCasesMissingBaseReplayId
      .map((test) => `"${test.title}"`)
      .join(", ");
    throw new Error(
      `The following test cases are missing a baseReplayId: ${namesOfInvalidTests}.` +
        " Please either run with the --baseCommitSha option, or add a baseReplayId to all test cases."
    );
  }

  const baseReplayIdBySessionId = await getBaseReplayIdsBySessionId({
    client,
    baseCommitSha,
  });

  return uncachedTestCases.flatMap((test) => {
    if (test.baseReplayId != null) {
      return [test];
    }
    const baseReplayId = baseReplayIdBySessionId[test.sessionId];
    if (baseReplayId == null) {
      const logger = log.getLogger(METICULOUS_LOGGER_NAME);
      logger.warn(
        `Skipping comparisons for test "${test.title}" since no result to compare against stored for base commit ${baseCommitSha}`
      );
      return [test];
    }
    return [{ ...test, baseReplayId }];
  });
};

const getBaseReplayIdsBySessionId = async ({
  client,
  baseCommitSha,
}: {
  client: AxiosInstance;
  baseCommitSha: string;
}): Promise<Record<string, string>> => {
  const baseTestRun = await getLatestTestRunResults({
    client,
    commitSha: baseCommitSha,
  });
  const baseReplays = baseTestRun?.resultData?.results ?? [];
  const baseReplayIdBySessionId: Record<string, string> = {};
  // If there are multiple replays for a given session we take the last in the list
  baseReplays.forEach((replay) => {
    baseReplayIdBySessionId[replay.sessionId] = replay.headReplayId;
  });
  return baseReplayIdBySessionId;
};
