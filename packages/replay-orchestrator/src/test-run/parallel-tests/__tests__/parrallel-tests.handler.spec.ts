import { TestCase } from "@alwaysmeticulous/api";
import { defer } from "@alwaysmeticulous/common";
import { runAllTestsInParallel } from "../parallel-tests.handler";
import { TestRunProgress } from "../run-all-tests.types";
import { DetailedTestCaseResult } from "../utils/config.types";
import {
  diff,
  flake,
  missingHead,
  noDiff,
  testResult,
} from "./mock-test-results";

describe("runAllTestsInParallel", () => {
  it("maximises the number of tests run in parralel, up to the provided limit", async () => {
    let progress: TestRunProgress = {
      runningTestCases: 4,
      failedTestCases: 0,
      flakedTestCases: 0,
      passedTestCases: 0,
    };
    let testsStarted = 0;
    const testRunPromises = [defer(), defer(), defer(), defer()];
    const overallPromise = runAllTestsInParallel({
      testsToRun: [testCase(0), testCase(1), testCase(2), testCase(3)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 0,
      executeTest: async (
        testCase: TestCase
      ): Promise<DetailedTestCaseResult> => {
        testsStarted++;
        await testRunPromises[parseInt(testCase.title ?? "")].promise;
        return testResult("pass", [noDiff(0)], testCase);
      },
      onTestFinished: async (newProgress) => {
        progress = newProgress;
      },
    });

    await waitForPromisesToFlush();

    expect(testsStarted).toEqual(2);
    expect(progress).toEqual({
      runningTestCases: 4,
      failedTestCases: 0,
      flakedTestCases: 0,
      passedTestCases: 0,
    });

    testRunPromises[0].resolve();
    await waitForPromisesToFlush();

    expect(testsStarted).toEqual(3);
    expect(progress).toEqual({
      runningTestCases: 3,
      failedTestCases: 0,
      flakedTestCases: 0,
      passedTestCases: 1,
    });

    testRunPromises[1].resolve();
    testRunPromises[2].resolve();
    await waitForPromisesToFlush();

    expect(testsStarted).toEqual(4);
    expect(progress).toEqual({
      runningTestCases: 1,
      failedTestCases: 0,
      flakedTestCases: 0,
      passedTestCases: 3,
    });
    await expectPromiseToNotHaveResolved(overallPromise);

    testRunPromises[3].resolve();
    await waitForPromisesToFlush();

    expect(progress).toEqual({
      runningTestCases: 0,
      failedTestCases: 0,
      flakedTestCases: 0,
      passedTestCases: 4,
    });

    await overallPromise;
  });

  it("can handle a test failing to run", async () => {
    let progress: TestRunProgress = {
      runningTestCases: 4,
      failedTestCases: 0,
      flakedTestCases: 0,
      passedTestCases: 0,
    };
    const testRunPromises = [defer(), defer(), defer(), defer()];
    const overallPromise = runAllTestsInParallel({
      testsToRun: [testCase(0), testCase(1), testCase(2), testCase(3)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 0,
      executeTest: async (
        testCase: TestCase
      ): Promise<DetailedTestCaseResult> => {
        await testRunPromises[parseInt(testCase.title ?? "")].promise;
        return testResult("pass", [noDiff(0)], testCase);
      },
      onTestFinished: async (newProgress) => {
        progress = newProgress;
      },
    });

    testRunPromises[0].resolve();
    testRunPromises[1].reject();
    testRunPromises[2].resolve();
    testRunPromises[3].resolve();

    const result = await overallPromise;
    expect(progress).toEqual({
      runningTestCases: 0,
      failedTestCases: 1,
      flakedTestCases: 0,
      passedTestCases: 3,
    });

    // No result given for test 1 (it can't, because it doesn't have a headReplayId)
    expect(result).toEqual([
      testResult("pass", [noDiff(0)], testCase(0)),
      testResult("pass", [noDiff(0)], testCase(2)),
      testResult("pass", [noDiff(0)], testCase(3)),
    ]);
  });

  it("does not retry failed tests if maxRetriesOnFailure is 0", async () => {
    const results = await runAllTestsInParallel({
      testsToRun: [testCase(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 0,
      executeTest: async (
        testCase: TestCase
      ): Promise<DetailedTestCaseResult> => {
        return testResult("fail", [diff(0)], testCase);
      },
    });

    expect(results).toEqual([testResult("fail", [diff(0)], testCase(0))]);
  });

  it("retries failed tests until maxRetriesOnFailure reached or first flake seen for all screenshots if maxRetriesOnFailure > 0", async () => {
    let retryNum = 0;
    const results = await runAllTestsInParallel({
      testsToRun: [testCase(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 10,
      rerunTestsNTimes: 0,
      executeTest: async (
        testCase: TestCase,
        isRetry
      ): Promise<DetailedTestCaseResult> => {
        if (!isRetry) {
          return testResult("fail", [diff(0), diff(1)], testCase);
        }
        if (retryNum === 3) {
          return testResult("fail", [missingHead(0), diff(1)], testCase);
        }
        retryNum++;
        return testResult("pass", [noDiff(0), diff(1)], testCase);
      },
    });

    expect(retryNum).toEqual(3);
    expect(results).toEqual([
      testResult(
        "flake",
        [
          flake(0, diff(), [missingHead()]),
          flake(1, diff(), [diff(), diff(), diff(), diff()]),
        ],
        testCase(0)
      ),
    ]);
  });

  it("marks test as a failure if hit max number of retries and no flakes detected", async () => {
    const results = await runAllTestsInParallel({
      testsToRun: [testCase(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 3,
      rerunTestsNTimes: 0,
      executeTest: async (
        testCase: TestCase,
        isRetry
      ): Promise<DetailedTestCaseResult> => {
        if (!isRetry) {
          return testResult("fail", [diff(0), diff(1)], testCase);
        }
        return testResult("pass", [noDiff(0), diff(1)], testCase);
      },
    });

    expect(results).toEqual([
      testResult(
        "fail",
        [diff(0), flake(1, diff(), [diff(), diff(), diff()])],
        testCase(0)
      ),
    ]);
  });

  it("retries N times if rerunTestsNTimes > 0", async () => {
    let rerunNum = 0;
    const results = await runAllTestsInParallel({
      testsToRun: [testCase(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 3,
      executeTest: async (
        testCase: TestCase,
        isRetry
      ): Promise<DetailedTestCaseResult> => {
        if (!isRetry) {
          return testResult("pass", [diff(0), noDiff(1)], testCase);
        }
        if (rerunNum === 2) {
          return testResult("fail", [missingHead(0), diff(1)], testCase);
        }
        rerunNum++;
        return testResult("pass", [noDiff(0), noDiff(1)], testCase);
      },
    });

    expect(rerunNum).toEqual(2);
    expect(results).toEqual([
      testResult(
        // Flake outcome is returned iff all screenshots are flaky.
        "flake",
        [flake(0, diff(), [missingHead()]), flake(1, noDiff(), [diff()])],
        testCase(0)
      ),
    ]);
  });
});

const testCase = (num: number): TestCase => ({
  sessionId: "mock-session-id",
  title: `${num}`,
  baseTestRunId: "mock-base-test-run-id",
});

const expectPromiseToNotHaveResolved = async (promise: Promise<unknown>) => {
  let resolved = false;

  promise.then(
    () => {
      resolved = true;
    },
    () => {
      resolved = true;
    }
  );

  await waitForPromisesToFlush();

  expect(resolved).toEqual(false);
};

const waitForPromisesToFlush = () =>
  new Promise((resolve) => setTimeout(resolve, 0));
