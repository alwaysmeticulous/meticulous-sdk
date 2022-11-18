import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { getLatestTestRunResults } from "../api/test-run.api";
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
    (testCase): TestCase[] =>
      // Note: explictly setting the baseReplayId is required for typescript to be happy with types
      testCase.baseReplayId == null
        ? []
        : [{ ...testCase, baseReplayId: testCase.baseReplayId }]
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
      // Note: explictly setting the baseReplayId is required for typescript to be happy with types
      return [{ ...test, baseReplayId: test.baseReplayId }];
    }
    const baseReplayId = baseReplayIdBySessionId[test.sessionId];
    if (baseReplayId == null) {
      const logger = log.getLogger(METICULOUS_LOGGER_NAME);
      logger.warn(
        `Skipping comparisons for test "${test.title}" since no result to compare against stored for base commit ${baseCommitSha}`
      );
      return test;
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

  if (baseTestRun?.status === "Running") {
    // Note: for now we just ignore results that haven't completed yet, but in future we may want to block
    // on the test run completely (poll until it's complete, or timed out).
    const logger = log.getLogger(METICULOUS_LOGGER_NAME);
    logger.warn(
      `Test run (${baseTestRun.id}) on base commit (${baseCommitSha}) is still running. This means some comparisons may be skipped.`
    );
  }

  const baseReplays = baseTestRun?.resultData?.results ?? [];
  const baseReplayIdBySessionId: Record<string, string> = {};
  // If there are multiple replays for a given session we take the last in the list
  baseReplays.forEach((replay) => {
    baseReplayIdBySessionId[replay.sessionId] = replay.headReplayId;
  });
  return baseReplayIdBySessionId;
};
