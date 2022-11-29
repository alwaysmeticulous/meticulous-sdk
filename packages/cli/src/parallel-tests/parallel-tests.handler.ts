import { fork } from "child_process";
import { cpus } from "os";
import { join } from "path";
import { TestCase } from "@alwaysmeticulous/api";
import {
  defer,
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  ReplayEventsDependencies,
  ReplayExecutionOptions,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { TestRun } from "../api/test-run.api";
import { ScreenshotAssertionsEnabledOptions } from "../command-utils/common-types";
import {
  DetailedTestCaseResult,
  MeticulousCliConfig,
} from "../config/config.types";
import { getReplayTargetForTestCase } from "../utils/config.utils";
import { sortResults } from "../utils/run-all-tests.utils";
import { InitMessage, ResultMessage } from "./messages.types";
import { TestRunProgress } from "./run-all-tests.types";

export interface RunAllTestsInParallelOptions {
  config: MeticulousCliConfig;
  testRun: TestRun;
  testsToRun: TestCase[];
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
  apiToken: string | null;
  commitSha: string;

  appUrl: string | null;
  useAssetsSnapshottedInBaseSimulation: boolean;
  parallelTasks: number | null;
  deflake: boolean;
  replayEventsDependencies: ReplayEventsDependencies;

  maxRetriesOnFailure: number;

  onTestFinished?: (
    progress: TestRunProgress,
    resultsSoFar: DetailedTestCaseResult[]
  ) => Promise<void>;
}

interface RerunnableTestCase extends TestCase {
  id: number;
}

/** Handler for running Meticulous tests in parallel using child processes */
export const runAllTestsInParallel: (
  options: RunAllTestsInParallelOptions
) => Promise<DetailedTestCaseResult[]> = async ({
  config,
  testRun,
  testsToRun,
  apiToken,
  commitSha,
  appUrl,
  useAssetsSnapshottedInBaseSimulation,
  executionOptions,
  screenshottingOptions,
  parallelTasks,
  deflake,
  maxRetriesOnFailure,
  replayEventsDependencies,
  onTestFinished,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  let nextId = 0;
  const queue: RerunnableTestCase[] = testsToRun.map((test) => ({
    ...test,
    id: ++nextId,
  }));

  /**
   * Stores multiple results for a given test id if the test has been re-executed
   * multiple times to check for flakes.
   */
  const resultsByTestId = new Map<number, DetailedTestCaseResult[]>();
  /**
   * Results that have been fully checked for flakes, at most one per test case.
   */
  const finalResults: DetailedTestCaseResult[] = [];
  const progress: TestRunProgress = {
    runningTestCases: queue.length,
    failedTestCases: 0,
    flakedTestCases: 0,
    passedTestCases: 0,
  };

  const allTasksDone = defer<void>();

  let inProgress = 0;
  const maxTasks = parallelTasks ?? Math.max(cpus().length, 1);
  logger.debug(`Running with ${maxTasks} maximum tasks in parallel`);

  const taskHandler = join(__dirname, "task.handler.js");

  // Starts running a test case in a child process
  const startTask = (rerunnableTestCase: RerunnableTestCase) => {
    const { id, ...testCase } = rerunnableTestCase;
    const deferredResult = defer<DetailedTestCaseResult>();
    const child = fork(taskHandler, [], { stdio: "inherit" });

    const messageHandler = (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        (message as any)["kind"] === "result"
      ) {
        const resultMessage = message as ResultMessage;
        deferredResult.resolve(resultMessage.data.result);
        child.off("message", messageHandler);
      }
    };

    child.on("error", (error) => {
      if (deferredResult.getState() === "pending") {
        deferredResult.reject(error);
      }
    });
    child.on("exit", (code) => {
      if (code) {
        logger.debug(`child exited with code: ${code}`);
      }
      if (deferredResult.getState() === "pending") {
        deferredResult.reject(new Error("No result"));
      }
    });
    child.on("message", messageHandler);

    // Send test case and arguments to child process
    const initMessage: InitMessage = {
      kind: "init",
      data: {
        logLevel: logger.getLevel(),
        dataDir: getMeticulousLocalDataDir(),
        replayOptions: {
          apiToken,
          commitSha,
          testCase,
          deflake,
          replayTarget: getReplayTargetForTestCase({
            useAssetsSnapshottedInBaseSimulation,
            appUrl,
            testCase,
          }),
          executionOptions,
          screenshottingOptions,
          generatedBy: { type: "testRun", runId: testRun.id },
          testRunId: testRun.id,
          replayEventsDependencies,
        },
      },
    };
    child.send(initMessage);

    // Handle task completion
    deferredResult.promise
      .catch(() => {
        // If it threw an error then it's something fatal, rather than just a failed diff
        // (it resolves successfully on a failed diff)
        const result: DetailedTestCaseResult = {
          ...testCase,
          headReplayId: "",
          result: "fail",
          screenshotDiffResults: [],
        };
        return result;
      })
      .then(async (result) => {
        --inProgress;

        if (result.result === "fail" && !resultsByTestId.has(id)) {
          // TODO: For perf may want to cancel the tasks off the queue if and when we
          // find out all screenshots are either a pass or a flake
          queue.push(
            ...Array.from(new Array(maxRetriesOnFailure)).map(() => ({
              id,
              testCase,
            }))
          );
        }

        const resultsForTestCase = [...(resultsByTestId.get(id) ?? []), result];
        resultsByTestId.set(id, resultsForTestCase);
        const isFinalResult =
          resultsForTestCase[0].result === "pass" ||
          resultsForTestCase.length === maxRetriesOnFailure + 1;
        if (isFinalResult) {
          const mergedResult = mergeResults(resultsForTestCase);
          finalResults.push(mergedResult);
          --progress.runningTestCases;
          progress.failedTestCases += mergedResult.result === "fail" ? 1 : 0;
          progress.flakedTestCases += mergedResult.result === "flake" ? 1 : 0;
          progress.passedTestCases += mergedResult.result === "pass" ? 1 : 0;
          onTestFinished?.(progress, finalResults).then(() => {
            if (queue.length === 0 && inProgress === 0) {
              allTasksDone.resolve();
            }
          });
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

    startTask(testCase);

    process.nextTick(checkNextTask);
  };

  process.nextTick(checkNextTask);

  await allTasksDone.promise;

  return sortResults({
    results: finalResults,
    testCases: config.testCases || [],
  });
};

const mergeResults = (
  resultsForTestCase: DetailedTestCaseResult[]
): DetailedTestCaseResult => {
  // TODO: This is wrong, this merge needs to happen at the screenshot diff level
  return resultsForTestCase.reduce(
    (
      mergedResult: DetailedTestCaseResult,
      nextResult: DetailedTestCaseResult
    ) => ({
      ...mergedResult,
      result:
        nextResult.result !== mergedResult.result
          ? "flake"
          : mergedResult.result,
    }),
    resultsForTestCase[0]
  );
};
