import { join, normalize } from "path";
import { TestCase, TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClient,
  getLatestTestRunId,
  getProject,
} from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  getMeticulousVersion,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import {
  DetailedTestCaseResult,
  RunAllTestsOptions,
  RunAllTestsResult,
  TestRunProgress,
} from "@alwaysmeticulous/sdk-bundles-api";
import { AxiosInstance } from "axios";
import log from "loglevel";
import { createReplayDiff } from "../../api/replay-diff.api";
import {
  createTestRun,
  getTestRunUrl,
  putTestRunResults,
} from "../../api/test-run.api";
import { loadReplayEventsDependencies } from "../../replay/scripts-loader/load-replay-dependencies";
import { executeTestInChildProcess } from "./execute-test-in-child-process";
import { InitMessage } from "./messages.types";
import { runAllTestsInParallel } from "./parallel-tests.handler";
import { readConfig } from "./utils/config";
import { getReplayTargetForTestCase } from "./utils/get-replay-target-for-test-case";
import { writeGitHubSummary } from "./utils/github-summary.utils";
import { mergeTestCases, sortResults } from "./utils/run-all-tests.utils";
import { getEnvironment } from "./utils/test-run-environment.utils";

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
  executionOptions,
  screenshottingOptions,
  parallelTasks,
  maxRetriesOnFailure,
  rerunTestsNTimes,
  cachedTestRunResults: cachedTestRunResults_,
  githubSummary,
  environment,
  baseTestRunId,
  onTestRunCreated,
  onTestFinished: onTestFinished_,
}: RunAllTestsOptions): Promise<RunAllTestsResult> => {
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
    ({ sessionId, baseTestRunId, title }) =>
      !cachedTestRunResults.find(
        (cached) =>
          cached.sessionId === sessionId &&
          cached.baseTestRunId === baseTestRunId &&
          cached.title === title
      )
  );

  const packageJsonPath = normalize(join(__dirname, "../../../package.json"));
  const meticulousSha = await getMeticulousVersion(packageJsonPath);
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
        parallelTasks,
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

  const testsToRun = await getTestCasesWithBaseTestRunId({
    baseCommitSha,
    baseTestRunId: baseTestRunId ?? null,
    client,
    logger,
    testCases,
  });

  const storeTestRunResults = async (
    status: TestRunStatus,
    resultsSoFar: DetailedTestCaseResult[]
  ) => {
    const resultsToSendToBE = [
      ...cachedTestRunResults,
      ...resultsSoFar.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ screenshotDiffResultsByBaseReplayId, ...result }) => result
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
    if (newResult != null) {
      for (const [baseReplayId, screenshotDiffResults] of Object.entries(
        newResult.screenshotDiffResultsByBaseReplayId
      )) {
        await createReplayDiff({
          client,
          headReplayId: newResult.headReplayId,
          baseReplayId: baseReplayId,
          testRunId: testRun.id,
          data: {
            screenshotAssertionsOptions: screenshottingOptions,
            screenshotDiffResults,
          },
        });
      }
    }
    await storeTestRunResults("Running", resultsSoFar);
  };

  const results = await runAllTestsInParallel({
    testsToRun,
    parallelTasks,
    maxRetriesOnFailure,
    rerunTestsNTimes,
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
            replayTarget: getReplayTargetForTestCase({
              appUrl,
              testCase,
            }),
            executionOptions,
            screenshottingOptions,
            generatedBy: { type: "testRun", runId: testRun.id },
            testRunId: testRun.id,
            baseTestRunId: testCase.baseTestRunId ?? null,
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

const getTestCasesWithBaseTestRunId = async ({
  logger,
  client,
  baseCommitSha,
  baseTestRunId,
  testCases,
}: {
  logger: log.Logger;
  client: AxiosInstance;
  baseCommitSha: string | null;
  baseTestRunId: string | null;
  testCases: TestCase[];
}) => {
  const defaultBaseTestRunId =
    baseCommitSha != null
      ? await getLatestTestRunId({
          client,
          commitSha: baseCommitSha,
        })
      : null;

  const testsToRun: TestCase[] = testCases.map((test) => {
    // We use the baseTestRunId specified in the test case if it exists, otherwise we use
    // use the baseTestRunId specified from the CLI args if it exists, otherwise we use the
    // baseTestRunId for the base commit if it exists, otherwise we use null (don't compare screenshots).
    const fallbackTestRunId = baseTestRunId ?? defaultBaseTestRunId;
    if (test.baseTestRunId != null || fallbackTestRunId == null) {
      return test;
    }
    return { ...test, baseTestRunId: fallbackTestRunId };
  });
  if (baseCommitSha != null) {
    testsToRun
      .filter((test) => test.baseTestRunId == null)
      .forEach((test) => {
        logger.warn(
          `Skipping comparisons for test "${test.title}" since no result to compare against stored for base commit ${baseCommitSha}`
        );
      });
  }
  return testsToRun;
};
