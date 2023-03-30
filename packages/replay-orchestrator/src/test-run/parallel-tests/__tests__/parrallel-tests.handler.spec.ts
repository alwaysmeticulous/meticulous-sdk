import { defer } from "@alwaysmeticulous/common";
import {
  DetailedTestCaseResult,
  TestRunProgress,
} from "@alwaysmeticulous/sdk-bundles-api";
import { runAllTestsInParallel } from "../parallel-tests.handler";
import { TestTask } from "../test-task.types";
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
      testsToRun: [testTask(0), testTask(1), testTask(2), testTask(3)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 0,
      executeTest: async (
        testTask: TestTask
      ): Promise<DetailedTestCaseResult> => {
        testsStarted++;
        await testRunPromises[parseInt(testTask.title ?? "")].promise;
        return testResult("pass", [noDiff(0)], testTask);
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
      testsToRun: [testTask(0), testTask(1), testTask(2), testTask(3)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 0,
      executeTest: async (
        testTask: TestTask
      ): Promise<DetailedTestCaseResult> => {
        await testRunPromises[parseInt(testTask.title ?? "")].promise;
        return testResult("pass", [noDiff(0)], testTask);
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
      testResult("pass", [noDiff(0)], testTask(0)),
      testResult("pass", [noDiff(0)], testTask(2)),
      testResult("pass", [noDiff(0)], testTask(3)),
    ]);
  });

  it("does not retry failed tests if maxRetriesOnFailure is 0", async () => {
    const results = await runAllTestsInParallel({
      testsToRun: [testTask(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 0,
      executeTest: async (
        testTask: TestTask
      ): Promise<DetailedTestCaseResult> => {
        return testResult("fail", [diff(0)], testTask);
      },
    });

    expect(results).toEqual([testResult("fail", [diff(0)], testTask(0))]);
  });

  it("retries failed tests until maxRetriesOnFailure reached or first flake seen for all screenshots if maxRetriesOnFailure > 0", async () => {
    let retryNum = 0;
    const results = await runAllTestsInParallel({
      testsToRun: [testTask(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 10,
      rerunTestsNTimes: 0,
      executeTest: async (
        testTask: TestTask
      ): Promise<DetailedTestCaseResult> => {
        if (!testTask.isRetry) {
          return testResult("fail", [diff(0), diff(1)], testTask);
        }
        if (retryNum === 3) {
          return testResult("fail", [missingHead(0), diff(1)], testTask);
        }
        retryNum++;
        return testResult("pass", [noDiff(0), diff(1)], testTask);
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
        testTask(0)
      ),
    ]);
  });

  it("marks test as a failure if hit max number of retries and no flakes detected", async () => {
    const results = await runAllTestsInParallel({
      testsToRun: [testTask(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 3,
      rerunTestsNTimes: 0,
      executeTest: async (
        testTask: TestTask
      ): Promise<DetailedTestCaseResult> => {
        if (!testTask.isRetry) {
          return testResult("fail", [diff(0), diff(1)], testTask);
        }
        return testResult("pass", [noDiff(0), diff(1)], testTask);
      },
    });

    expect(results).toEqual([
      testResult(
        "fail",
        [diff(0), flake(1, diff(), [diff(), diff(), diff()])],
        testTask(0)
      ),
    ]);
  });

  it("retries N times if rerunTestsNTimes > 0", async () => {
    let rerunNum = 0;
    const results = await runAllTestsInParallel({
      testsToRun: [testTask(0)],
      parallelTasks: 2,
      maxRetriesOnFailure: 0,
      rerunTestsNTimes: 3,
      executeTest: async (
        testTask: TestTask
      ): Promise<DetailedTestCaseResult> => {
        if (!testTask.isRetry) {
          return testResult("pass", [diff(0), noDiff(1)], testTask);
        }
        if (rerunNum === 2) {
          return testResult("fail", [missingHead(0), diff(1)], testTask);
        }
        rerunNum++;
        return testResult("pass", [noDiff(0), noDiff(1)], testTask);
      },
    });

    expect(rerunNum).toEqual(2);
    expect(results).toEqual([
      testResult(
        // Flake outcome is returned iff all screenshots are flaky.
        "flake",
        [flake(0, diff(), [missingHead()]), flake(1, noDiff(), [diff()])],
        testTask(0)
      ),
    ]);
  });
});

const testTask = (num: number): TestTask => ({
  sessionId: "mock-session-id",
  title: `${num}`,
  executionOptions: "mock-execution-options" as any,
  screenshottingOptions: {
    enabled: true,
    storyboardOptions: { enabled: true },
    compareTo: {
      type: "best-replay-for-session-in-test-run",
      testRunId: "mock-base-test-run-id",
      diffOptions: {
        diffThreshold: 0.01,
        diffPixelThreshold: 0.1,
      },
    },
  },
  replayTarget: {
    type: "url",
    appUrl: "mock-url",
  },
  originalTestCase: {
    sessionId: "mock-session-id",
    title: `${num}`,
  },
  isRetry: false,
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
