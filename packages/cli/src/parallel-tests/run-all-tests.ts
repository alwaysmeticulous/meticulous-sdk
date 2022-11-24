import {
  METICULOUS_LOGGER_NAME,
  ReplayExecutionOptions,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../api/client";
import {
  createTestRun,
  getCachedTestRunResults,
  getTestRunUrl,
  putTestRunResults,
  TestRunStatus,
} from "../api/test-run.api";
import { ScreenshotAssertionsEnabledOptions } from "../command-utils/common-types";
import { readConfig } from "../config/config";
import { DetailedTestCaseResult } from "../config/config.types";
import { deflakeReplayCommandHandler } from "../deflake-tests/deflake-tests.handler";
import { loadReplayEventsDependencies } from "../local-data/replay-assets";
import { runAllTestsInParallel } from "../parallel-tests/parallel-tests.handler";
import { getCommitSha } from "../utils/commit-sha.utils";
import { getReplayTargetForTestCase } from "../utils/config.utils";
import { writeGitHubSummary } from "../utils/github-summary.utils";
import { getTestsToRun, sortResults } from "../utils/run-all-tests.utils";
import { getMeticulousVersion } from "../utils/version.utils";
import { TestRunProgress } from "./run-all-tests.types";

export interface Options {
  testsFile: string | null;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
  apiToken: string | null;
  commitSha: string | null;

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
  useCache: boolean;

  githubSummary: boolean;

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

export const runAllTests = async ({
  testsFile,
  apiToken,
  commitSha: commitSha_,
  baseCommitSha,
  appUrl,
  useAssetsSnapshottedInBaseSimulation,
  executionOptions,
  screenshottingOptions,
  parallelTasks,
  deflake,
  useCache,
  githubSummary,
  onTestRunCreated,
  onTestFinished,
}: Options): Promise<RunAllTestsResult> => {
  if (appUrl != null && useAssetsSnapshottedInBaseSimulation) {
    throw new Error(
      "Arguments useAssetsSnapshottedInBaseSimulation and appUrl are mutually exclusive"
    );
  }

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  const config = await readConfig(testsFile || undefined);
  const testCases = config.testCases || [];

  if (!testCases.length) {
    throw new Error("Error! No test case defined");
  }

  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  const meticulousSha = await getMeticulousVersion();

  const cachedTestRunResults = useCache
    ? await getCachedTestRunResults({ client, commitSha })
    : [];

  const replayEventsDependencies = await loadReplayEventsDependencies();

  const testRun = await createTestRun({
    client,
    commitSha,
    meticulousSha,
    configData: config,
  });

  const testRunUrl = getTestRunUrl(testRun);
  onTestRunCreated?.({
    id: testRun.id,
    url: testRunUrl,
    status: "Running",
    progress: {
      failedTestCases: 0,
      passedTestCases: 0,
      runningTestCases: testCases.length,
    },
  });
  logger.info("");
  logger.info(`Test run URL: ${testRunUrl}`);
  logger.info("");

  const getResults = async () => {
    if (parallelTasks == null || parallelTasks > 1) {
      const results = await runAllTestsInParallel({
        config,
        client,
        testRun,
        executionOptions,
        screenshottingOptions,
        apiToken,
        commitSha,
        appUrl,
        useAssetsSnapshottedInBaseSimulation,
        parallelTasks,
        deflake,
        cachedTestRunResults,
        replayEventsDependencies,
        baseCommitSha,
        onTestFinished: (progress) => {
          onTestFinished?.({
            id: testRun.id,
            url: testRunUrl,
            status: "Running",
            progress,
          });
        },
      });
      return results;
    }

    const results: DetailedTestCaseResult[] = [...cachedTestRunResults];
    const testsToRun = await getTestsToRun({
      testCases,
      cachedTestRunResults,
      client,
      baseCommitSha: baseCommitSha ?? null,
    });
    const progress: TestRunProgress = {
      runningTestCases: testRun.length,
      failedTestCases: 0,
      passedTestCases: 0,
    };
    for (const testCase of testsToRun) {
      const result = await deflakeReplayCommandHandler({
        replayTarget: getReplayTargetForTestCase({
          useAssetsSnapshottedInBaseSimulation,
          appUrl,
          testCase,
        }),
        executionOptions,
        screenshottingOptions,
        testCase,
        apiToken,
        commitSha,
        deflake,
        generatedBy: { type: "testRun", runId: testRun.id },
        testRunId: testRun.id,
        replayEventsDependencies,
      });
      results.push(result);
      progress.failedTestCases += result.result === "fail" ? 1 : 0;
      progress.passedTestCases += result.result === "pass" ? 1 : 0;
      --progress.runningTestCases;
      onTestFinished?.({
        id: testRun.id,
        url: testRunUrl,
        status: "Running",
        progress,
      });
      await putTestRunResults({
        client,
        testRunId: testRun.id,
        status: "Running",
        resultData: { results },
      });
    }
    return sortResults({ results, testCases });
  };

  const results = await getResults();

  const runAllFailure = results.find(({ result }) => result === "fail");
  const overallStatus = runAllFailure ? "Failure" : "Success";
  await putTestRunResults({
    client,
    testRunId: testRun.id,
    status: overallStatus,
    resultData: {
      results: results.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ screenshotDiffResults, ...coreResult }) => coreResult
      ),
    },
  });

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
