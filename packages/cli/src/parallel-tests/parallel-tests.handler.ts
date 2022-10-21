import {
  defer,
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import { fork } from "child_process";
import log from "loglevel";
import { cpus } from "os";
import { join } from "path";
import { putTestRunResults, TestRun } from "../api/test-run.api";
import {
  MeticulousCliConfig,
  TestCase,
  TestCaseResult,
} from "../config/config.types";
import { getSimulationIdForAssets } from "../utils/config.utils";
import { getTestsToRun, sortResults } from "../utils/run-all-tests.utils";
import { InitMessage, ResultMessage } from "./messages.types";

export interface RunAllTestsInParallelOptions {
  config: MeticulousCliConfig;
  client: AxiosInstance;
  testRun: TestRun;
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  appUrl: string | null | undefined;
  useAssetsSnapshottedInBaseSimulation?: boolean | null | undefined;
  headless: boolean | null | undefined;
  devTools: boolean | null | undefined;
  bypassCSP: boolean | null | undefined;
  diffThreshold: number | null | undefined;
  diffPixelThreshold: number;
  padTime: boolean;
  shiftTime: boolean;
  networkStubbing: boolean;
  parallelTasks: number | null | undefined;
  deflake: boolean;
  cachedTestRunResults: TestCaseResult[];
  accelerate: boolean;
}

/** Handler for running Meticulous tests in parallel using child processes */
export const runAllTestsInParallel: (
  options: RunAllTestsInParallelOptions
) => Promise<TestCaseResult[]> = async ({
  config,
  client,
  testRun,
  apiToken,
  commitSha,
  appUrl,
  useAssetsSnapshottedInBaseSimulation,
  headless,
  devTools,
  bypassCSP,
  diffThreshold,
  diffPixelThreshold,
  padTime,
  shiftTime,
  networkStubbing,
  parallelTasks,
  deflake,
  cachedTestRunResults,
  accelerate,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const results: TestCaseResult[] = [...cachedTestRunResults];
  const queue = getTestsToRun({
    testCases: config.testCases || [],
    cachedTestRunResults,
  });

  const allTasksDone = defer<void>();

  let inProgress = 0;
  const maxTasks = parallelTasks ?? Math.max(cpus().length, 1);
  logger.debug(`Running with ${maxTasks} maximum tasks in parallel`);

  const taskHandler = join(__dirname, "task.handler.js");

  // Starts running a test case in a child process
  const startTask = (testCase: TestCase) => {
    const deferredResult = defer<TestCaseResult>();
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
    const simulationIdForAssets = getSimulationIdForAssets(
      testCase,
      useAssetsSnapshottedInBaseSimulation
    );
    const testCaseWithOverridesApplied = {
      ...testCase,
      options: {
        ...(testCase.options ?? {}),
        appUrl,
        simulationIdForAssets,
      },
    };
    const initMessage: InitMessage = {
      kind: "init",
      data: {
        logLevel: logger.getLevel(),
        dataDir: getMeticulousLocalDataDir(),
        runAllOptions: {
          apiToken,
          commitSha,
          headless,
          devTools,
          bypassCSP,
          diffThreshold: diffThreshold ?? undefined,
          diffPixelThreshold,
          padTime,
          shiftTime,
          networkStubbing,
          accelerate,
          screenshot: true,
        },
        testCaseWithOverridesApplied,
        deflake,
      },
    };
    child.send(initMessage);

    // Handle task completion
    deferredResult.promise
      .catch(() => {
        const result: TestCaseResult = {
          ...testCase,
          headReplayId: "",
          result: "fail",
        };
        return result;
      })
      .then(async (result) => {
        --inProgress;

        results.push(result);
        putTestRunResults({
          client,
          testRunId: testRun.id,
          status: "Running",
          resultData: { results },
        })
          .catch((error) => {
            logger.error(`Error while pushing partial results: ${error}`);
          })
          .then(() => {
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
