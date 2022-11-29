import { TestRunEnvironment } from "@alwaysmeticulous/api";
import {
  METICULOUS_LOGGER_NAME,
  ReplayExecutionOptions,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../api/client";
import { createReplayDiff } from "../api/replay-diff.api";
import {
  createTestRun,
  getTestRunUrl,
  putTestRunResults,
  TestRunStatus,
} from "../api/test-run.api";
import { ScreenshotAssertionsEnabledOptions } from "../command-utils/common-types";
import { readConfig } from "../config/config";
import { DetailedTestCaseResult, TestCaseResult } from "../config/config.types";
import { loadReplayEventsDependencies } from "../local-data/replay-assets";
import { runAllTestsInParallel } from "../parallel-tests/parallel-tests.handler";
import { writeGitHubSummary } from "../utils/github-summary.utils";
import { getTestsToRun } from "../utils/run-all-tests.utils";
import { getEnvironment } from "../utils/test-run-environment.utils";
import { getMeticulousVersion } from "../utils/version.utils";
import { TestRunProgress } from "./run-all-tests.types";

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

  onTestRunCreated?: (testRun: TestRun & { status: "Running" }) => void;
  onTestFinished?: (testRun: TestRun & { status: "Running" }) => void;
}
export interface RunAllTestsResult {
  testRun: TestRun & { status: "Success" | "Failure" };
  testCaseResults: DetailedTestCaseResult[];
}

export interface TestRun {
  id: string;
  url: string;
  status: TestRunStatus;
  progress: TestRunProgress;
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

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });
  const cachedTestRunResults = cachedTestRunResults_ ?? [];

  const config = await readConfig(testsFile || undefined);
  const allTestCases = config.testCases || [];

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

  const onTestFinished = async (
    progress: TestRunProgress,
    resultsSoFar: DetailedTestCaseResult[]
  ) => {
    onTestFinished_?.({
      id: testRun.id,
      url: testRunUrl,
      status: "Running",
      progress: {
        ...progress,
        passedTestCases: progress.passedTestCases + cachedTestRunResults.length,
      },
    });
    const newResult = resultsSoFar.at(-1);
    if (newResult?.baseReplayId != null) {
      await createReplayDiff({
        client,
        headReplayId: newResult.headReplayId,
        baseReplayId: newResult.baseReplayId,
        testRunId: null,
        data: {
          screenshotAssertionsOptions: screenshottingOptions,
          screenshotDiffResults: newResult.screenshotDiffResults,
        },
      });
    }
    await storeTestRunResults("Running", resultsSoFar);
  };

  const results = await runAllTestsInParallel({
    config,
    testRun,
    testsToRun,
    executionOptions,
    screenshottingOptions,
    apiToken,
    commitSha,
    appUrl,
    useAssetsSnapshottedInBaseSimulation,
    parallelTasks,
    deflake,
    replayEventsDependencies,
    onTestFinished,
    maxRetriesOnFailure,
  });

  const runAllFailure = results.find(({ result }) => result === "fail");
  const overallStatus = runAllFailure ? "Failure" : "Success";
  await storeTestRunResults(overallStatus, results);

  logger.info("");
  logger.info("Results");
  logger.info("=======");
  logger.info(`URL: ${testRunUrl}`);
  logger.info("=======");
  results.forEach(({ title, result }) => {
    logger.info(`${title} => ${result}`);
  });

  if (githubSummary) {
    await writeGitHubSummary({ testRunUrl, results });
  }

  return {
    testRun: {
      url: testRunUrl,
      id: testRun.id,
      status: overallStatus,
      progress: {
        flakedTestCases: results.filter(({ result }) => result === "flake")
          .length,
        passedTestCases: results.filter(({ result }) => result === "pass")
          .length,
        failedTestCases: results.filter(({ result }) => result === "fail")
          .length,
        runningTestCases: 0,
      },
    },
    testCaseResults: results,
  };
};
