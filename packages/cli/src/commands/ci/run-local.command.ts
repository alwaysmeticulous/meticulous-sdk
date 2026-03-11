import {
  ScreenshotAssertionsOptions,
  ScreenshotDiffOptions,
  StoryboardOptions,
} from "@alwaysmeticulous/api";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import { executeTestRun } from "@alwaysmeticulous/replay-orchestrator-launcher";
import { ReplayExecutionOptions } from "@alwaysmeticulous/sdk-bundles-api";
import chalk from "chalk";
import { CommandModule } from "yargs";
import {
  COMMON_REPLAY_OPTIONS,
  HEADLESS_FLAG,
  OPTIONS,
  SCREENSHOT_DIFF_OPTIONS,
} from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
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
  dryRun?: boolean;
}

const NO_PARALLELIZE_FLAG = "--no-parallelize";

const handler = async ({
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
  parallelTasks: parallelTasks_,
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
  dryRun,
}: Options): Promise<void> => {
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

  const parallelTasks = noParallelize ? 1 : parallelTasks_;
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";

  if (dryRun) {
    logger.info(
      `Dry run: would run all tests locally for commit ${commitSha}${appUrl ? ` against ${appUrl}` : ""}`,
    );
    return;
  }

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
      parallelTasks: parallelTasks ?? null,
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

export const ciRunLocalCommand: CommandModule<unknown, Options> = {
  command: "run-local",
  describe: "Run all replay test cases locally",
  builder: {
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
        "If set to a value greater than 0 then will re-run any replays that give a visual diff and mark them as a flake if the snapshot generated on one of the retried replays differs from that in the first replay.",
      default: 0,
    },
    rerunTestsNTimes: {
      number: true,
      description:
        "If set to a value greater than 0 then will re-run all replays the specified number of times and mark them as a flake if the visual snapshot generated on one of the retried replays differs from that in the first replay.",
      default: 0,
    },
    testsFile: {
      string: true,
      description:
        "The path to the meticulous.json file containing the list of tests you want to run. If not set a search will be performed to find a meticulous.json file in the current directory or the nearest parent directory.",
    },
    baseTestRunId: {
      string: true,
      description: "The id of a test run to compare visual snapshots against.",
    },
    moveBeforeMouseEvent: OPTIONS.moveBeforeMouseEvent,
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  },
  handler: wrapHandler(handler),
};
