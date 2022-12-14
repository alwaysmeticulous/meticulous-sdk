import { TestCase } from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { getLatestTestRunResults } from "../api/test-run.api";
import { DetailedTestCaseResult } from "../config/config.types";

export const mergeTestCases = (
  ...testSuites: (TestCase[] | null | undefined)[]
): TestCase[] => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.debug(testSuites.length);

  const seenSessionIds = new Set<string>();

  return testSuites.flatMap((testSuite) => {
    if (testSuite == null) {
      return [];
    }
    return testSuite.flatMap((testCase) => {
      if (seenSessionIds.has(testCase.sessionId)) {
        return [];
      }
      seenSessionIds.add(testCase.sessionId);
      return [testCase];
    });
  });

  // testSuites.forEach((arr) => {
  //   logger.debug(arr);
  // });

  // return [];
};

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

  /**
   * The base commit to compare test results against for test cases that don't have a baseReplayId specified.
   */
  baseCommitSha: string | null;
}

export const getTestsToRun = async ({
  testCases,
  client,
  baseCommitSha,
}: GetTestsToRunOptions): Promise<TestCase[]> => {
  const testCasesMissingBaseReplayId = testCases.filter(
    (testCase) => testCase.baseReplayId == null
  );
  const testCasesWithBaseReplayId = testCases.flatMap((testCase): TestCase[] =>
    testCase.baseReplayId == null ? [] : [testCase]
  );

  if (testCasesMissingBaseReplayId.length === 0) {
    return testCasesWithBaseReplayId;
  }

  const baseReplayIdBySessionId = await getBaseReplayIdsBySessionId({
    client,
    baseCommitSha,
  });

  return testCases.flatMap((test) => {
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
  baseCommitSha: string | null;
}): Promise<Record<string, string>> => {
  if (!baseCommitSha) {
    return {};
  }
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
