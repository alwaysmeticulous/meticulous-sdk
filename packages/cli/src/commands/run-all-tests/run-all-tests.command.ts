import {
  ScreenshotAssertionsOptions,
  ScreenshotDiffOptions,
  StoryboardOptions,
} from "@alwaysmeticulous/api";
import { getCommitSha } from "@alwaysmeticulous/common";
import { executeTestRun } from "@alwaysmeticulous/replay-orchestrator-launcher";
import { ReplayExecutionOptions } from "@alwaysmeticulous/sdk-bundles-api";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
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
  parallelize: boolean;
  parallelTasks?: number | null | undefined;
  maxRetriesOnFailure: number;
  rerunTestsNTimes: number;
  testsFile?: string | undefined;
  maxDurationMs: number | null | undefined;
  maxEventCount: number | null | undefined;
  storyboard: boolean;
  baseTestRunId?: string | undefined;
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
  parallelize,
  parallelTasks: parrelelTasks_,
  maxRetriesOnFailure,
  rerunTestsNTimes,
  testsFile,
  disableRemoteFonts,
  noSandbox,
  skipPauses,
  moveBeforeClick,
  maxDurationMs,
  maxEventCount,
  storyboard,
  essentialFeaturesOnly,
  baseTestRunId,
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
    moveBeforeClick,
    maxDurationMs: maxDurationMs ?? null,
    maxEventCount: maxEventCount ?? null,
    essentialFeaturesOnly,
  };
  const storyboardOptions: StoryboardOptions = storyboard
    ? { enabled: true }
    : { enabled: false };
  const screenshottingOptions: ScreenshotAssertionsOptions = {
    enabled: true,
    diffOptions: { diffPixelThreshold, diffThreshold },
    storyboardOptions,
  };

  const parrelelTasks = parallelize ? parrelelTasks_ : 1;
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
      string: true,
      description:
        "The URL to execute the tests against. If left absent here and in the test cases file, then will use the URL the test was originally recorded against.",
    },
    githubSummary: {
      boolean: true,
      description: "Outputs a summary page for GitHub actions",
      default: false,
    },
    parallelize: {
      boolean: true,
      description: "Run tests in parallel",
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
        "If set to a value greater than 0 then will re-run any replays that give a screenshot diff and mark them as a flake if the screenshot generated on one of the retryed replays differs from that in the first replay.",
      default: 0,
    },
    rerunTestsNTimes: {
      number: true,
      description:
        "If set to a value greater than 0 then will re-run all replays the specified number of times and mark them as a flake if the screenshot generated on one of the retryed replays differs from that in the first replay.",
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
      description: "The id of a test run to compare screenshots against.",
    },
    moveBeforeClick: OPTIONS.moveBeforeClick,
    ...COMMON_REPLAY_OPTIONS,
    ...SCREENSHOT_DIFF_OPTIONS,
  } as const)
  .handler(handler);
