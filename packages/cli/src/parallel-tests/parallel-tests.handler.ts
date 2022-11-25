import { fork } from "child_process";
import { cpus } from "os";
import { join } from "path";
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
  TestCase,
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

  onTestFinished?: (
    progress: TestRunProgress,
    resultsSoFar: DetailedTestCaseResult[]
  ) => Promise<void>;
}

/** Handler for running Meticulous tests in parallel using child processes */
export const runAllTestsInParallel: (
  options: RunAllTestsInParallelOptions
) => Promise<DetailedTestCaseResult[]> = async ({
  config,
  testRun,
  testsToRun: queue,
  apiToken,
  commitSha,
  appUrl,
  useAssetsSnapshottedInBaseSimulation,
  executionOptions,
  screenshottingOptions,
  parallelTasks,
  deflake,
  replayEventsDependencies,
  onTestFinished,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const results: DetailedTestCaseResult[] = [];
  const progress: TestRunProgress = {
    runningTestCases: queue.length,
    failedTestCases: 0,
    passedTestCases: 0,
  };

  const allTasksDone = defer<void>();

  let inProgress = 0;
  const maxTasks = parallelTasks ?? Math.max(cpus().length, 1);
  logger.debug(`Running with ${maxTasks} maximum tasks in parallel`);

  const taskHandler = join(__dirname, "task.handler.js");

  // Starts running a test case in a child process
  const startTask = (testCase: TestCase) => {
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

        results.push(result);
        progress.failedTestCases += result.result === "fail" ? 1 : 0;
        progress.passedTestCases += result.result === "pass" ? 1 : 0;
        --progress.runningTestCases;
        onTestFinished?.(progress, results).then(() => {
          if (results.length === (config.testCases?.length || 0)) {
            allTasksDone.resolve();
          }
        });

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

  return sortResults({ results, testCases: config.testCases || [] });
};
