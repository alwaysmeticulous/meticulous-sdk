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
import { mergeResults } from "./merge-test-results";
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

interface TestCaseResults {
  currentResult: DetailedTestCaseResult;
  numberOfRetriesExecuted: number;
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
  let queue: RerunnableTestCase[] = testsToRun.map((test) => ({
    ...test,
    id: ++nextId,
  }));

  /**
   * Stores multiple results for a given test id if the test has been re-executed
   * multiple times to check for flakes.
   */
  const resultsByTestId = new Map<number, TestCaseResults>();
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
        const resultsForTestCase = resultsByTestId.get(id);
        if (
          resultsForTestCase != null &&
          resultsForTestCase.currentResult.result === "flake"
        ) {
          // This test has already been declared as flakey, and we can ignore this result. This result
          // was from an already executing test that we weren't able to cancel.
          process.nextTick(checkNextTask);
          return;
        }

        --inProgress;

        if (result.result === "fail" && !resultsByTestId.has(id)) {
          queue.push(
            ...Array.from(new Array(maxRetriesOnFailure)).map(() => ({
              ...testCase,
              id,
              baseReplayId: result.headReplayId,
            }))
          );
        }

        const mergedResult =
          resultsForTestCase != null
            ? mergeResults({
                currentResult: resultsForTestCase.currentResult,
                comparisonToHeadReplay: result,
              })
            : result;
        const numberOfRetriesExecuted =
          resultsForTestCase == null
            ? 0
            : resultsForTestCase.numberOfRetriesExecuted + 1;

        // Our work is done for this test case if the first result was a pass,
        // we've performed all the retries, or one of the retries already proved
        // the result as flakey
        const isFinalResult =
          mergedResult.result !== "fail" ||
          numberOfRetriesExecuted === maxRetriesOnFailure;

        resultsByTestId.set(id, {
          currentResult: mergedResult,
          numberOfRetriesExecuted,
        });

        if (isFinalResult) {
          // Cancel any replays that are still scheduled
          queue = queue.filter(({ id }) => id !== id);

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
