import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import {
  createTestRun,
  getCachedTestRunResults,
  getTestRunUrl,
  putTestRunResults,
} from "../../api/test-run.api";
import {
  COMMON_REPLAY_OPTIONS,
  DEFAULT_DIFF_PIXEL_THRESHOLD,
  DEFAULT_MISMATCH_THRESHOLD,
  PRIMARY_COMMON_REPLAY_OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
  SECONDARY_COMMON_REPLAY_OPTIONS,
} from "../../command-utils/common-options";
import {
  CommonReplayOptions,
  ScreenshotDiffOptions,
} from "../../command-utils/common-types";
import { readConfig } from "../../config/config";
import { TestCaseResult } from "../../config/config.types";
import { deflakeReplayCommandHandler } from "../../deflake-tests/deflake-tests.handler";
import { runAllTestsInParallel } from "../../parallel-tests/parallel-tests.handler";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { getSimulationIdForAssets } from "../../utils/config.utils";
import { writeGitHubSummary } from "../../utils/github-summary.utils";
import { getTestsToRun, sortResults } from "../../utils/run-all-tests.utils";
import { wrapHandler } from "../../utils/sentry.utils";
import { getMeticulousVersion } from "../../utils/version.utils";

interface Options extends CommonReplayOptions, ScreenshotDiffOptions {
  appUrl?: string | null | undefined;
  useAssetsSnapshottedInBaseSimulation?: boolean | null | undefined;
  githubSummary?: boolean | null | undefined;
  parallelize?: boolean | null | undefined;
  parallelTasks?: number | null | undefined;
  deflake: boolean;
  useCache: boolean;
  testsFile?: string | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
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
  accelerate,
}) => {
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
      });
      return results;
    }

    const results: TestCaseResult[] = [...cachedTestRunResults];
    const testsToRun = getTestsToRun({ testCases, cachedTestRunResults });
    for (const testCase of testsToRun) {
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
      const result = await deflakeReplayCommandHandler({
        testCase: testCaseWithOverridesApplied,
        deflake: deflake || false,
        apiToken,
        commitSha,
        headless,
        devTools,
        bypassCSP,
        diffThreshold,
        diffPixelThreshold,
        padTime,
        shiftTime,
        networkStubbing,
        accelerate,
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

export const runAllTests: CommandModule<unknown, Options> = {
  command: "run-all-tests",
  describe: "Run all replay test cases",
  builder: {
    ...PRIMARY_COMMON_REPLAY_OPTIONS,
    appUrl: {
      string: true,
    },
    useAssetsSnapshottedInBaseSimulation: {
      boolean: true,
      description:
        "If present will run each session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.)" +
        " from the base simulation/replay the test is comparing against. The sessions will then be replayed against those local urls." +
        " This is an alternative to specifying an appUrl.",
      conflicts: "appUrl",
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
    ...SECONDARY_COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  },
  handler: wrapHandler(handler),
};
