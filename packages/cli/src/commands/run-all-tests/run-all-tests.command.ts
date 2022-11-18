import {
  METICULOUS_LOGGER_NAME,
  ReplayExecutionOptions,
  StoryboardOptions,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../../api/client";
import {
  createTestRun,
  getCachedTestRunResults,
  getTestRunUrl,
  putTestRunResults,
} from "../../api/test-run.api";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
  OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
} from "../../command-utils/common-options";
import {
  ScreenshotAssertionsOptions,
  ScreenshotDiffOptions,
} from "../../command-utils/common-types";
import { readConfig } from "../../config/config";
import { TestCaseResult } from "../../config/config.types";
import { deflakeReplayCommandHandler } from "../../deflake-tests/deflake-tests.handler";
import { loadReplayEventsDependencies } from "../../local-data/replay-assets";
import { runAllTestsInParallel } from "../../parallel-tests/parallel-tests.handler";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { getReplayTargetForTestCase } from "../../utils/config.utils";
import { writeGitHubSummary } from "../../utils/github-summary.utils";
import { getTestsToRun, sortResults } from "../../utils/run-all-tests.utils";
import { getMeticulousVersion } from "../../utils/version.utils";

interface Options
  extends ScreenshotDiffOptions,
    Omit<ReplayExecutionOptions, "maxDurationMs" | "maxEventCount"> {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseCommitSha?: string | undefined;
  appUrl?: string | undefined;
  useAssetsSnapshottedInBaseSimulation: boolean;
  githubSummary?: boolean | undefined;
  parallelize?: boolean | undefined;
  parallelTasks?: number | null | undefined;
  deflake: boolean;
  useCache: boolean;
  testsFile?: string | undefined;
  maxDurationMs: number | null | undefined;
  maxEventCount: number | null | undefined;
  storyboard: boolean;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  baseCommitSha,
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
  githubSummary,
  parallelize,
  parallelTasks,
  deflake,
  useCache,
  testsFile,
  disableRemoteFonts,
  skipPauses,
  moveBeforeClick,
  maxDurationMs,
  maxEventCount,
  storyboard,
}) => {
  if (appUrl != null && useAssetsSnapshottedInBaseSimulation) {
    throw new Error(
      "Arguments useAssetsSnapshottedInBaseSimulation and appUrl are mutually exclusive"
    );
  }

  const executionOptions: ReplayExecutionOptions = {
    headless,
    devTools,
    bypassCSP,
    padTime,
    shiftTime,
    networkStubbing,
    disableRemoteFonts,
    skipPauses,
    moveBeforeClick,
    maxDurationMs: maxDurationMs ?? null,
    maxEventCount: maxEventCount ?? null,
  };
  const storyboardOptions: StoryboardOptions = storyboard
    ? { enabled: true }
    : { enabled: false };
  const screenshottingOptions: ScreenshotAssertionsOptions = {
    enabled: true,
    screenshotSelector: null, // this is only specified on a test case level
    diffOptions: { diffPixelThreshold, diffThreshold },
    storyboardOptions,
  };

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  const config = await readConfig(testsFile || undefined);
  const testCases = config.testCases || [];

  if (!testCases.length) {
    logger.error("Error! No test case defined");
    process.exit(1);
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
  logger.info("");
  logger.info(`Test run URL: ${testRunUrl}`);
  logger.info("");

  const getResults = async () => {
    if (parallelize) {
      const results = await runAllTestsInParallel({
        config,
        client,
        testRun,
        executionOptions,
        screenshottingOptions,
        apiToken: apiToken ?? null,
        commitSha,
        appUrl: appUrl ?? null,
        useAssetsSnapshottedInBaseSimulation,
        parallelTasks: parallelTasks ?? null,
        deflake,
        cachedTestRunResults,
        replayEventsDependencies,
        baseCommitSha: baseCommitSha ?? null,
      });
      return results;
    }

    const results: TestCaseResult[] = [...cachedTestRunResults];
    const testsToRun = await getTestsToRun({
      testCases,
      cachedTestRunResults,
      client,
      baseCommitSha: baseCommitSha ?? null,
    });
    for (const testCase of testsToRun) {
      const result = await deflakeReplayCommandHandler({
        replayTarget: getReplayTargetForTestCase({
          useAssetsSnapshottedInBaseSimulation,
          appUrl: appUrl ?? null,
          testCase,
        }),
        executionOptions,
        screenshottingOptions,
        testCase,
        apiToken: apiToken ?? null,
        commitSha,
        deflake: deflake ?? false,
        generatedBy: { type: "testRun", runId: testRun.id },
        testRunId: testRun.id,
        replayEventsDependencies,
      });
      results.push(result);
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
  await putTestRunResults({
    client,
    testRunId: testRun.id,
    status: runAllFailure ? "Failure" : "Success",
    resultData: { results },
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
    await writeGitHubSummary({ testRun, results });
  }

  if (runAllFailure) {
    process.exit(1);
  }
};

export const runAllTests = buildCommand("run-all-tests")
  .details({ describe: "Run all replay test cases" })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    baseCommitSha: {
      string: true,
      description:
        "The base commit to compare test results against for test cases that don't have a baseReplayId specified.",
    },
    appUrl: {
      string: true,
      description:
        "The URL to execute the tests against. If left absent here and in the test cases file, then will use the URL the test was originally recorded against.",
    },
    useAssetsSnapshottedInBaseSimulation: {
      boolean: true,
      description:
        "If present will run each session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.)" +
        " from the base simulation/replay the test is comparing against. The sessions will then be replayed against those local urls." +
        " This is an alternative to specifying an appUrl.",
      default: false,
    },
    githubSummary: {
      boolean: true,
      description: "Outputs a summary page for GitHub actions",
    },
    parallelize: {
      boolean: true,
      description: "Run tests in parallel",
    },
    parallelTasks: {
      number: true,
      description: "Number of tasks to run in parallel",
      coerce: (value: number | null | undefined) => {
        if (typeof value === "number" && value <= 0) {
          return null;
        }
        return value;
      },
    },
    deflake: {
      boolean: true,
      description: "Attempt to deflake failing tests",
      default: false,
    },
    useCache: {
      boolean: true,
      description: "Use result cache",
      default: false,
    },
    testsFile: {
      string: true,
      description:
        "The path to the meticulous.json file containing the list of tests you want to run." +
        " If not set a search will be performed to find a meticulous.json file in the current directory or the nearest parent directory.",
    },
    moveBeforeClick: OPTIONS.moveBeforeClick,
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  } as const)
  .handler(handler);
