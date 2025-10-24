import {
  ScreenshotAssertionsOptions,
  ScreenshotDiffOptions,
  StoryboardOptions,
} from "@alwaysmeticulous/api";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import { executeTestRun } from "@alwaysmeticulous/replay-orchestrator-launcher";
import { ReplayExecutionOptions } from "@alwaysmeticulous/sdk-bundles-api";
import chalk from "chalk";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
  HEADLESS_FLAG,
  OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
} from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

interface Options
  extends ScreenshotDiffOptions,
    Omit<ReplayExecutionOptions, "maxDurationMs" | "maxEventCount"> {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseCommitSha?: string | undefined;
  appUrl?: string | undefined;
  githubSummary: boolean;
  noParallelize: boolean;
  parallelTasks?: number | null | undefined;
  maxRetriesOnFailure: number;
  rerunTestsNTimes: number;
  testsFile?: string | undefined;
  maxDurationMs: number | null | undefined;
  maxEventCount: number | null | undefined;
  storyboard: boolean;
  baseTestRunId?: string | undefined;
  sessionIdForApplicationStorage?: string | undefined;
  enableCssCoverage?: boolean;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  baseCommitSha,
  appUrl,
  headless,
  devTools,
  bypassCSP,
  diffThreshold,
  diffPixelThreshold,
  shiftTime,
  networkStubbing,
  githubSummary,
  noParallelize,
  parallelTasks: parrelelTasks_,
  maxRetriesOnFailure,
  rerunTestsNTimes,
  testsFile,
  disableRemoteFonts,
  noSandbox,
  skipPauses,
  moveBeforeMouseEvent,
  maxDurationMs,
  maxEventCount,
  storyboard,
  essentialFeaturesOnly,
  logPossibleNonDeterminism,
  baseTestRunId,
  sessionIdForApplicationStorage,
  enableCssCoverage,
}) => {
  const executionOptions: ReplayExecutionOptions = {
    headless,
    devTools,
    bypassCSP,
    shiftTime,
    networkStubbing,
    disableRemoteFonts,
    noSandbox,
    skipPauses,
    moveBeforeMouseEvent,
    maxDurationMs: maxDurationMs ?? null,
    maxEventCount: maxEventCount ?? null,
    logPossibleNonDeterminism,
    essentialFeaturesOnly,
    enableCssCoverage: enableCssCoverage ?? false,
  };
  const storyboardOptions: StoryboardOptions = storyboard
    ? { enabled: true }
    : { enabled: false };
  const screenshottingOptions: ScreenshotAssertionsOptions = {
    enabled: true,
    diffOptions: { diffPixelThreshold, diffThreshold },
    storyboardOptions,
  };

  const logger = initLogger();

  if (!noParallelize && headless) {
    logger.info(
      `\nRunning tests in parallel. Run with ${chalk.bold(
        NO_PARALLELIZE_FLAG,
      )} to run tests sequentially.`,
    );
  } else if (!noParallelize && !headless) {
    logger.info(
      `\nRunning tests in parallel. Run with ${chalk.bold(
        NO_PARALLELIZE_FLAG,
      )} to run tests sequentially, or with ${chalk.bold(
        HEADLESS_FLAG,
      )} to hide the windows.`,
    );
  } else if (!headless) {
    logger.info(
      `\nTip: run with ${chalk.bold(HEADLESS_FLAG)} to hide the windows.`,
    );
  }

  const parrelelTasks = noParallelize ? 1 : parrelelTasks_;
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  try {
    const { testRun } = await executeTestRun({
      testsFile: testsFile ?? null,
      executionOptions,
      screenshottingOptions,
      apiToken: apiToken ?? null,
      commitSha,
      baseCommitSha: baseCommitSha ?? null,
      baseTestRunId: baseTestRunId ?? null,
      appUrl: appUrl ?? null,
      parallelTasks: parrelelTasks ?? null,
      maxRetriesOnFailure,
      rerunTestsNTimes,
      githubSummary,
      sessionIdForApplicationStorage: sessionIdForApplicationStorage ?? null,
      maxSemanticVersionSupported: 1,
    });

    if (testRun.status === "Failure") {
      process.exit(1);
    }
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
};

const NO_PARALLELIZE_FLAG = "--no-parallelize";

export const runAllTestsCommand = buildCommand("run-all-tests")
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
      demandOption: true,
      string: true,
      description:
        "The URL to execute the tests against. This parameter is required.",
    },
    githubSummary: {
      boolean: true,
      description: "Outputs a summary page for GitHub actions",
      default: false,
    },
    noParallelize: {
      boolean: true,
      description: "Run tests sequentially",
      default: false,
    },
    parallelTasks: {
      number: true,
      description:
        "Number of tasks to run in parallel (defaults to two per CPU)",
      coerce: (value: number | null | undefined) => {
        if (typeof value === "number" && value <= 0) {
          return null;
        }
        return value;
      },
    },
    maxRetriesOnFailure: {
      number: true,
      description:
        "If set to a value greater than 0 then will re-run any replays that give a visual diff and mark them as a flake if the snapshot generated on one of the retryed replays differs from that in the first replay.",
      default: 0,
    },
    rerunTestsNTimes: {
      number: true,
      description:
        "If set to a value greater than 0 then will re-run all replays the specified number of times and mark them as a flake if the visual snapshot generated on one of the retryed replays differs from that in the first replay.",
      default: 0,
    },
    testsFile: {
      string: true,
      description:
        "The path to the meticulous.json file containing the list of tests you want to run." +
        " If not set a search will be performed to find a meticulous.json file in the current directory or the nearest parent directory.",
    },
    baseTestRunId: {
      string: true,
      description: "The id of a test run to compare visual snapshots against.",
    },
    moveBeforeMouseEvent: OPTIONS.moveBeforeMouseEvent,
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  } as const)
  .handler(handler);
