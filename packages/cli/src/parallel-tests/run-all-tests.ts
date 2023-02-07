import { TestRunEnvironment } from "@alwaysmeticulous/api";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
  ReplayExecutionOptions,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../api/client";
import { getProject } from "../api/project.api";
import { createReplayDiff } from "../api/replay-diff.api";
import {
  createTestRun,
  getTestRunUrl,
  putTestRunResults,
} from "../api/test-run.api";
import { TestRun, TestRunStatus } from "../api/types";
import { ScreenshotAssertionsEnabledOptions } from "../command-utils/common-types";
import { readConfig } from "../config/config";
import { DetailedTestCaseResult, TestCaseResult } from "../config/config.types";
import { loadReplayEventsDependencies } from "../local-data/replay-assets";
import { runAllTestsInParallel } from "../parallel-tests/parallel-tests.handler";
import { getReplayTargetForTestCase } from "../utils/config.utils";
import { writeGitHubSummary } from "../utils/github-summary.utils";
import {
  getTestsToRun,
  mergeTestCases,
  sortResults,
} from "../utils/run-all-tests.utils";
import { getEnvironment } from "../utils/test-run-environment.utils";
import { getMeticulousVersion } from "../utils/version.utils";
import { executeTestInChildProcess } from "./execute-test-in-child-process";
import { InitMessage } from "./messages.types";
import { TestRunProgress } from "./run-all-tests.types";

export type RunAllTestsTestRun = Pick<
  TestRun,
  "id" | "url" | "status" | "project"
> & {
  progress: TestRunProgress;
  url: string;
};

export interface Options {
  testsFile: string | null;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
  apiToken: string | null;
  commitSha: string;

  /**
   * The base commit to compare test results against for test cases that don't have a baseReplayId specified.
   */
  baseCommitSha: string | null;

  appUrl: string | null;
  useAssetsSnapshottedInBaseSimulation: boolean;

  /**
   * If null runs in parralel with a sensible number of parrelel tasks for the given machine.
   *
   * Set to 1 to disable parralelism.
   */
  parallelTasks: number | null;
  deflake: boolean;

  /**
   * If set to a value greater than 1 then will re-run any replays that give a screenshot diff
   * and mark them as a flake if the screenshot generated on one of the retryed replays differs from that
   * in the first replay.
   */
  maxRetriesOnFailure: number;

  githubSummary: boolean;

  /**
   * If provided it will incorportate the cachedTestRunResults in any calls to store
   * test run results in the BE, but won't include the cachedTestRunResults in the returned
   * RunAllTestsResult.
   */
  cachedTestRunResults?: TestCaseResult[];

  /**
   * Captured environment for this run
   */
  environment?: TestRunEnvironment;

  onTestRunCreated?: (
    testRun: RunAllTestsTestRun & { status: "Running" }
  ) => void;
  onTestFinished?: (
    testRun: RunAllTestsTestRun & { status: "Running" }
  ) => void;
}
export interface RunAllTestsResult {
  testRun: RunAllTestsTestRun & { status: "Success" | "Failure" };
  testCaseResults: DetailedTestCaseResult[];
}

/**
 * Runs all the test cases in the provided file.
 * @returns The results of the tests that were executed (note that this does not include results from any cachedTestRunResults passed in)
 */
export const runAllTests = async ({
  testsFile,
  apiToken,
  commitSha,
  baseCommitSha,
  appUrl,
  useAssetsSnapshottedInBaseSimulation,
  executionOptions,
  screenshottingOptions,
  parallelTasks,
  deflake,
  maxRetriesOnFailure,
  cachedTestRunResults: cachedTestRunResults_,
  githubSummary,
  environment,
  onTestRunCreated,
  onTestFinished: onTestFinished_,
}: Options): Promise<RunAllTestsResult> => {
  if (appUrl != null && useAssetsSnapshottedInBaseSimulation) {
    throw new Error(
      "Arguments useAssetsSnapshottedInBaseSimulation and appUrl are mutually exclusive"
    );
  }

  if (deflake && maxRetriesOnFailure > 1) {
    throw new Error(
      "Arguments deflake and maxRetriesOnFailure are mutually exclusive"
    );
  }

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  const project = await getProject(client);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const cachedTestRunResults = cachedTestRunResults_ ?? [];

  const config = await readConfig(testsFile || undefined);
  const allTestCases = mergeTestCases(
    project.configurationData.testCases,
    config.testCases
  );

  if (!allTestCases.length) {
    throw new Error("Error! No test case defined");
  }

  // Only run the uncached test cases
  const testCases = allTestCases.filter(
    ({ sessionId, baseReplayId, title }) =>
      !cachedTestRunResults.find(
        (cached) =>
          cached.sessionId === sessionId &&
          cached.baseReplayId === baseReplayId &&
          cached.title === title
      )
  );

  const meticulousSha = await getMeticulousVersion();

  const replayEventsDependencies = await loadReplayEventsDependencies();

  const testRun = await createTestRun({
    client,
    commitSha,
    meticulousSha,
    configData: {
      ...config,
      testCases: allTestCases,
      arguments: {
        executionOptions,
        screenshottingOptions,
        commitSha,
        baseCommitSha,
        appUrl,
        useAssetsSnapshottedInBaseSimulation,
        parallelTasks,
        deflake,
        githubSummary,
      },
      environment: getEnvironment(environment),
    },
  });

  const testRunUrl = getTestRunUrl(testRun);
  onTestRunCreated?.({
    id: testRun.id,
    url: testRunUrl,
    project: testRun.project,
    status: "Running",
    progress: {
      failedTestCases: 0,
      flakedTestCases: 0,
      passedTestCases: cachedTestRunResults.length,
      runningTestCases: testCases.length,
    },
  });
  logger.info("");
  logger.info(`Test run URL: ${testRunUrl}`);
  logger.info("");

  const testsToRun = await getTestsToRun({
    testCases,
    client,
    baseCommitSha: baseCommitSha ?? null,
  });

  const storeTestRunResults = async (
    status: TestRunStatus,
    resultsSoFar: DetailedTestCaseResult[]
  ) => {
    const resultsToSendToBE = [
      ...cachedTestRunResults,
      ...resultsSoFar.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ screenshotDiffResults, ...result }) => result
      ),
    ];
    try {
      await putTestRunResults({
        client,
        testRunId: testRun.id,
        status,
        resultData: {
          results: resultsToSendToBE,
        },
      });
    } catch (error) {
      logger.error(`Error while pushing partial results: ${error}`);
    }
  };

  const onProgressUpdated = async (progress: TestRunProgress) => {
    onTestFinished_?.({
      id: testRun.id,
      url: testRunUrl,
      project: testRun.project,
      status: "Running",
      progress: {
        ...progress,
        passedTestCases: progress.passedTestCases + cachedTestRunResults.length,
      },
    });
  };

  const onTestFinished = async (
    progress: TestRunProgress,
    resultsSoFar: DetailedTestCaseResult[]
  ) => {
    onProgressUpdated(progress);
    const newResult = resultsSoFar.at(-1);
    if (newResult?.baseReplayId != null) {
      await createReplayDiff({
        client,
        headReplayId: newResult.headReplayId,
        baseReplayId: newResult.baseReplayId,
        testRunId: testRun.id,
        data: {
          screenshotAssertionsOptions: screenshottingOptions,
          screenshotDiffResults: newResult.screenshotDiffResults,
        },
      });
    }
    await storeTestRunResults("Running", resultsSoFar);
  };

  const results = await runAllTestsInParallel({
    testsToRun,
    parallelTasks,
    maxRetriesOnFailure,
    executeTest: (testCase, isRetry) => {
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
            suppressScreenshotDiffLogging: isRetry,
          },
        },
      };
      return executeTestInChildProcess(initMessage);
    },
    onTestFinished,
    onTestFailedToRun: onProgressUpdated,
  });

  const sortedResults = sortResults({
    results: results,
    testCases: config.testCases || [],
  });

  const runAllFailure = sortedResults.find(({ result }) => result === "fail");
  const overallStatus = runAllFailure ? "Failure" : "Success";
  await storeTestRunResults(overallStatus, sortedResults);

  logger.info("");
  logger.info("Results");
  logger.info("=======");
  logger.info(`URL: ${testRunUrl}`);
  logger.info("=======");
  sortedResults.forEach(({ title, result }) => {
    logger.info(`${title} => ${result}`);
  });

  if (githubSummary) {
    await writeGitHubSummary({ testRunUrl: testRunUrl, results });
  }

  return {
    testRun: {
      url: testRunUrl,
      id: testRun.id,
      project: testRun.project,
      status: overallStatus,
      progress: {
        flakedTestCases: sortedResults.filter(
          ({ result }) => result === "flake"
        ).length,
        passedTestCases: sortedResults.filter(({ result }) => result === "pass")
          .length,
        failedTestCases: sortedResults.filter(({ result }) => result === "fail")
          .length,
        runningTestCases: 0,
      },
    },
    testCaseResults: sortedResults,
  };
};
