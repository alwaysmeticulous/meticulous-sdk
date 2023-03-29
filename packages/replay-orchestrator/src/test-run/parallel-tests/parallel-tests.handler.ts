import { cpus } from "os";
import { TestCase } from "@alwaysmeticulous/api";
import { defer, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { mergeResults } from "./merge-test-results";
import { TestRunProgress } from "./run-all-tests.types";
import { flattenScreenshotDiffResults } from "./screenshot-diff-results.utils";
import { DetailedTestCaseResult } from "./utils/config.types";

export interface RunAllTestsInParallelOptions {
  testsToRun: TestCase[];
  parallelTasks: number | null;
  maxRetriesOnFailure: number;
  rerunTestsNTimes: number;

  executeTest: (
    testCase: TestCase,
    isRetry: boolean
  ) => Promise<DetailedTestCaseResult>;

  onTestFinished?: (
    progress: TestRunProgress,
    resultsSoFar: DetailedTestCaseResult[]
  ) => Promise<void>;
  onTestFailedToRun?: (progress: TestRunProgress) => Promise<void>;
}

interface RerunnableTestCase extends TestCase {
  id: number;
}

interface TestCaseResults {
  currentResult: DetailedTestCaseResult;
  numberOfRetriesExecuted: number;
}

/** Handler for running Meticulous tests in parallel using child processes */
export const runAllTestsInParallel: (
  options: RunAllTestsInParallelOptions
) => Promise<DetailedTestCaseResult[]> = async ({
  testsToRun,
  parallelTasks,
  maxRetriesOnFailure,
  rerunTestsNTimes,
  executeTest,
  onTestFinished,
  onTestFailedToRun,
}) => {
  if (maxRetriesOnFailure && rerunTestsNTimes) {
    throw new Error(
      "maxRetriesOnFailure and rerunTestsNTimes are mutually exclusive."
    );
  }

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  let nextId = 0;
  let queue: RerunnableTestCase[] = testsToRun.map((test) => ({
    ...test,
    id: ++nextId,
  }));

  /**
   * The current results, which may still be being updated if we're re-running a test
   * to check for flakes.
   */
  const resultsByTestId = new Map<number, TestCaseResults>();
  /**
   * Results that have been fully checked for flakes. At most one per test case.
   */
  const finalResults: DetailedTestCaseResult[] = [];
  let progress: TestRunProgress = {
    runningTestCases: queue.length,
    failedTestCases: 0,
    flakedTestCases: 0,
    passedTestCases: 0,
  };

  const allTasksDone = defer<void>();

  let inProgress = 0;
  // Average run time when testing on a 16 core machine: 16 parallel tasks @ 56s, 32 parallel tasks @ 52.5s
  const maxTasks = parallelTasks ?? Math.max(cpus().length, 1) * 2;
  logger.debug(`Running with ${maxTasks} maximum tasks in parallel`);

  // Starts running a test case in a child process
  const startTask = (rerunnableTestCase: RerunnableTestCase) => {
    const { id, ...testCase } = rerunnableTestCase;
    const isRetry = resultsByTestId.has(id);

    // Handle task completion
    executeTest(testCase, isRetry)
      .catch(() => null)
      .then(async (result) => {
        const resultsForTestCase = resultsByTestId.get(id);

        // Re-run the test if needed, comparing to the base replay.
        if (!isRetry) {
          queue.push(
            ...Array.from(new Array(rerunTestsNTimes)).map(() => ({
              ...testCase,
              id,
              baseReplayId: result?.headReplayId,
            }))
          );
        }

        if (resultsForTestCase != null && result != null) {
          logRetrySummary(
            testName({ id, ...testCase }),
            result,
            resultsForTestCase.currentResult
          );
        }

        if (
          resultsForTestCase != null &&
          resultsForTestCase.currentResult.result === "flake"
        ) {
          // This test has already been declared as flakey, and we can ignore this result. This result
          // was from an already executing test that we weren't able to cancel.
          return;
        }

        if (result?.result === "fail" && resultsForTestCase == null) {
          // Let's auto-retry to see if this failure persists
          queue.push(
            ...Array.from(new Array(maxRetriesOnFailure)).map(() => ({
              ...testCase,
              id,
              baseReplayId: result.headReplayId,
            }))
          );
        }

        if (result == null && resultsForTestCase?.currentResult == null) {
          // This means our original head replay failed fatally (not just a failed diff, but failed to even run)
          progress = updateProgress(progress, "fail");
          await onTestFailedToRun?.(progress);
          return;
        }

        const mergedResult = getNewMergedResult(
          resultsForTestCase?.currentResult ?? null,
          result
        );

        const numberOfRetriesExecuted =
          resultsForTestCase == null
            ? 0
            : resultsForTestCase.numberOfRetriesExecuted + 1;

        resultsByTestId.set(id, {
          currentResult: mergedResult,
          numberOfRetriesExecuted,
        });

        // Our work is done for this test case if the first result was a pass,
        // we've performed all the retries, or one of the retries already proved
        // the result as flakey
        let isFinalResult: boolean;
        if (rerunTestsNTimes > 0) {
          isFinalResult = numberOfRetriesExecuted >= rerunTestsNTimes;
        } else {
          isFinalResult =
            mergedResult.result !== "fail" ||
            numberOfRetriesExecuted >= maxRetriesOnFailure;
        }

        if (isFinalResult) {
          // Cancel any replays that are still scheduled
          queue = queue.filter((otherReplay) => otherReplay.id !== id);

          finalResults.push(mergedResult);
          progress = updateProgress(progress, mergedResult.result);
          await onTestFinished?.(progress, finalResults);
        }
      })
      .catch((err) => {
        logger.error(
          `Error processing result of completed task for test '${testName({
            id,
            ...testCase,
          })}'`,
          err
        );
      })
      .finally(() => {
        // We only decrement inProgress at the very end,
        // otherwise another promise may call allTasksDone.resolve() while
        // we're still saving results
        --inProgress;

        if (queue.length === 0 && inProgress === 0) {
          allTasksDone.resolve();
        }

        process.nextTick(checkNextTask);
      });
  };

  // Checks if we can start a new child process
  const checkNextTask = () => {
    if (inProgress >= maxTasks) {
      return;
    }

    const testCase = queue.shift();
    if (!testCase) {
      return;
    }
    ++inProgress;

    if (resultsByTestId.has(testCase.id)) {
      if (maxRetriesOnFailure > 0) {
        logger.info(
          `Test ${testName(testCase)} failed. Retrying to check for flakes...`
        );
      } else if (rerunTestsNTimes > 0) {
        logger.info(`Re-running ${testName(testCase)} to check for flakes...`);
      }
    }
    startTask(testCase);

    process.nextTick(checkNextTask);
  };

  process.nextTick(checkNextTask);

  await allTasksDone.promise;

  return finalResults;
};

const logRetrySummary = (
  nameOfTest: string,
  retryResult: DetailedTestCaseResult,
  resultSoFar: DetailedTestCaseResult
) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  if (retryResult.result === "pass") {
    logger.info(
      `Retried taking screenshots for${
        resultSoFar.result == "fail" ? " failed" : ""
      } test ${nameOfTest}, but got the same results`
    );
  } else {
    const numDifferingScreenshots = flattenScreenshotDiffResults(
      retryResult
    ).filter((result) => result.outcome !== "no-diff").length;
    logger.info(
      `Retried taking screenshots for failed test ${nameOfTest}, and ${numDifferingScreenshots} screenshots came out different. Results for these screenshots are assumed to be flakes, and so will be ignored.`
    );
  }
};

const testName = (testCase: RerunnableTestCase) =>
  testCase.title != null ? `'${testCase.title}'` : `#${testCase.id + 1}`;

const getNewMergedResult = (
  currentMergedResult: DetailedTestCaseResult | null,
  newResult: DetailedTestCaseResult | null
): DetailedTestCaseResult => {
  // If currentMergedResult is null then this is our first try, our original head replay
  if (currentMergedResult == null) {
    if (newResult == null) {
      throw new Error(
        "Expected either newResult to be non-null or currentMergedResult to be non-null, but both were null. This case should be handled before getNewMergedResult is called"
      );
    }

    // In this case the newResult is our first head replay, our first result,
    // so lets initialize the mergedResult to this
    return newResult;
  }

  // If currentMergedResult is not null then newResult is a retry, containing comparison screenshots to our original head replay
  if (newResult == null) {
    // In this case newResult is a retry of the head replay, but it failed fatally (not just a failed diff, but failed to even run)
    // So we just ignore this retry
    return currentMergedResult;
  }

  return mergeResults({
    currentResult: currentMergedResult,
    comparisonToHeadReplay: newResult,
  });
};

const updateProgress = (
  progress: TestRunProgress,
  newResult: "pass" | "fail" | "flake"
): TestRunProgress => {
  return {
    runningTestCases: progress.runningTestCases - 1,
    failedTestCases: progress.failedTestCases + (newResult === "fail" ? 1 : 0),
    flakedTestCases: progress.flakedTestCases + (newResult === "flake" ? 1 : 0),
    passedTestCases: progress.passedTestCases + (newResult === "pass" ? 1 : 0),
  };
};
