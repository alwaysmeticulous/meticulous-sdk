import { join, normalize } from "path";
import {
  ScreenshotAssertionsEnabledOptions,
  ScreenshotDiffOptions,
  TestCase,
  TestCaseReplayOptions,
  TestRun,
  TestRunStatus,
} from "@alwaysmeticulous/api";
import {
  createClient,
  getLatestTestRunResults,
  getProject,
} from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  getMeticulousVersion,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import {
  DetailedTestCaseResult,
  ExecuteTestRunOptions,
  ExecuteTestRunResult,
  ReplayExecutionOptions,
  ScreenshotComparisonEnabledOptions,
  TestRunProgress,
} from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { createReplayDiff } from "../../api/replay-diff.api";
import {
  createTestRun,
  getTestRun,
  getTestRunUrl,
  putTestRunResults,
} from "../../api/test-run.api";
import { loadReplayEventsDependencies } from "../../replay/scripts-loader/load-replay-dependencies";
import { executeTestInChildProcess } from "./execute-test-in-child-process";
import { InitMessage } from "./messages.types";
import { runAllTestsInParallel } from "./parallel-tests.handler";
import { TestTask } from "./test-task.types";
import { readConfig } from "./utils/config";
import { getReplayTargetForTestCase } from "./utils/get-replay-target-for-test-case";
import { writeGitHubSummary } from "./utils/github-summary.utils";
import { mergeTestCases, sortResults } from "./utils/test-case.utils";
import { getEnvironment } from "./utils/test-run-environment.utils";

/**
 * Runs all the test cases in the provided file.
 * @returns The results of the tests that were executed (note that this does not include results from any cachedTestRunResults passed in)
 */
export const executeTestRun = async ({
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
}: ExecuteTestRunOptions): Promise<ExecuteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  const project = await getProject(client);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const cachedTestRunResults = cachedTestRunResults_ ?? [];

  let fallbackTestRun: TestRun | null = null;

  // We use the baseTestRunId specified from the CLI args if it exists, otherwise we use the
  // baseTestRunId for the base commit if it exists as a fallback base test run
  // (i.e. in case the test case doesn't have a baseTestRunId specified).
  if (baseTestRunId) {
    fallbackTestRun = await getTestRun({ client, testRunId: baseTestRunId });
  } else if (baseCommitSha) {
    fallbackTestRun = await getLatestTestRunResults({
      client,
      commitSha: baseCommitSha,
    });
  }

  const config = await readConfig(testsFile || undefined);

  const shouldIncludeBaseTestCases =
    !!fallbackTestRun &&
    (await shouldUseBaseTestRunTestCases({
      baseTestRun: fallbackTestRun,
    }));

  // We merge the test cases from the project config, the meticulous.json and the "fallback"(run-all-tests-level)
  // base test run.
  // This guarantees that we'll at least have some test cases which ran on the global base test run,
  // at the expense of higher run time (as we'll be running "older" test cases that aren't in the project config anymore).
  const allTestCases = mergeTestCases(
    project.configurationData.testCases,
    config.testCases,
    shouldIncludeBaseTestCases ? fallbackTestRun?.configData.testCases : []
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

  const testsToRun = await getTestTasks({
    baseCommitSha,
    fallbackTestRunId: fallbackTestRun?.id ?? null,
    appUrl,
    executionOptions,
    screenshottingOptions,
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
    executeTest: (testTask: TestTask) => {
      const initMessage: InitMessage = {
        kind: "init",
        data: {
          logLevel: logger.getLevel(),
          dataDir: getMeticulousLocalDataDir(),
          replayOptions: {
            // Fixed values across all tasks
            apiToken,
            commitSha,
            generatedBy: { type: "testRun", runId: testRun.id },
            testRunId: testRun.id,
            replayEventsDependencies,
            debugger: false,
            cookiesFile: null,

            // Specific to each task
            sessionId: testTask.sessionId,
            replayTarget: testTask.replayTarget,
            executionOptions: testTask.executionOptions,
            screenshottingOptions: testTask.screenshottingOptions,
            suppressScreenshotDiffLogging: testTask.isRetry,
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

const getTestTasks = async ({
  logger,
  baseCommitSha,
  fallbackTestRunId,
  appUrl,
  testCases,
  executionOptions,
  screenshottingOptions,
}: {
  logger: log.Logger;
  baseCommitSha: string | null;
  fallbackTestRunId: string | null;
  appUrl: string | null;
  testCases: TestCase[];
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
}) => {
  const testsToRun: TestTask[] = testCases.map((testCase) => {
    const mergedExecutionOptions =
      testCase.options == null
        ? executionOptions
        : applyTestCaseExecutionOptionOverrides(
            executionOptions,
            testCase.options
          );
    const { diffOptions, ...restOfScreenshottingOptions } =
      applyTestCaseScreenshottingOptionsOverrides(
        screenshottingOptions,
        testCase.options
      );

    // We use the baseTestRunId specified in the test case if it exists, otherwise we use
    // use the baseTestRunId specified from the CLI args if it exists, otherwise we use the
    // baseTestRunId for the base commit if it exists, otherwise we use null (don't compare screenshots).
    const baseTestRunId = testCase.baseTestRunId ?? fallbackTestRunId;

    if (baseCommitSha != null && baseTestRunId == null) {
      logger.warn(
        `Skipping comparisons for test "${testCase.title}" since no result to compare against stored for base commit ${baseCommitSha}`
      );
    }

    const mergedScreenshottingOptions: ScreenshotComparisonEnabledOptions = {
      ...restOfScreenshottingOptions,
      compareTo:
        baseTestRunId == null
          ? { type: "do-not-compare" }
          : {
              type: "best-replay-for-session-in-test-run",
              testRunId: baseTestRunId,
              diffOptions,
            },
    };

    return {
      title: testCase.title ?? null,
      sessionId: testCase.sessionId,
      replayTarget: getReplayTargetForTestCase({
        appUrl,
        testCase,
      }),
      executionOptions: mergedExecutionOptions,
      screenshottingOptions: mergedScreenshottingOptions,
      originalTestCase: testCase,
      isRetry: false,
    };
  });
  return testsToRun;
};

const shouldUseBaseTestRunTestCases = async ({
  baseTestRun,
}: {
  baseTestRun: TestRun;
}) => {
  // We only want to include the test cases from the base test run if it has no base test run itself, i.e the
  // the base test run is for a "push" event.
  // This safeguards against the test run expanding indefinitely.
  return !baseTestRun?.configData?.baseTestRunId;
};

const applyTestCaseExecutionOptionOverrides = (
  executionOptionsFromCliFlags: ReplayExecutionOptions,
  overridesFromTestCase: TestCaseReplayOptions
): ReplayExecutionOptions => {
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  return {
    ...executionOptionsFromCliFlags,
    moveBeforeClick:
      overridesFromTestCase.moveBeforeClick ??
      executionOptionsFromCliFlags.moveBeforeClick,
  };
};

const applyTestCaseScreenshottingOptionsOverrides = (
  screenshottingOptionsFromCliFlags: ScreenshotAssertionsEnabledOptions,
  overridesFromTestCase?: TestCaseReplayOptions
): ScreenshotAssertionsEnabledOptions => {
  if (overridesFromTestCase == null) {
    return screenshottingOptionsFromCliFlags;
  }
  // Options specified in the test case override those passed as CLI flags
  // (CLI flags set the defaults)
  const diffOptions: ScreenshotDiffOptions = {
    diffThreshold:
      overridesFromTestCase.diffThreshold ??
      screenshottingOptionsFromCliFlags.diffOptions.diffThreshold,
    diffPixelThreshold:
      overridesFromTestCase.diffPixelThreshold ??
      screenshottingOptionsFromCliFlags.diffOptions.diffPixelThreshold,
  };
  return {
    enabled: true,
    diffOptions,
    storyboardOptions: screenshottingOptionsFromCliFlags.storyboardOptions,
  };
};
