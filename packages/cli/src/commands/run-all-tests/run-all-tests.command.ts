import {
  ReplayExecutionOptions,
  StoryboardOptions,
} from "@alwaysmeticulous/common";
import { createClient } from "../../api/client";
import { getCachedTestRunResults } from "../../api/test-run.api";
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
import { runAllTests } from "../../parallel-tests/run-all-tests";
import { getCommitSha } from "../../utils/commit-sha.utils";

interface Options
  extends ScreenshotDiffOptions,
    Omit<ReplayExecutionOptions, "maxDurationMs" | "maxEventCount"> {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseCommitSha?: string | undefined;
  appUrl?: string | undefined;
  useAssetsSnapshottedInBaseSimulation: boolean;
  githubSummary: boolean;
  parallelize: boolean;
  parallelTasks?: number | null | undefined;
  deflake: boolean;
  maxRetriesOnFailure: number;
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
  parallelTasks: parrelelTasks_,
  deflake,
  maxRetriesOnFailure,
  useCache,
  testsFile,
  disableRemoteFonts,
  noSandbox,
  skipPauses,
  moveBeforeClick,
  maxDurationMs,
  maxEventCount,
  storyboard,
  essentialFeaturesOnly,
}) => {
  const executionOptions: ReplayExecutionOptions = {
    headless,
    devTools,
    bypassCSP,
    padTime,
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
    screenshotSelector: null, // this is only specified on a test case level
    diffOptions: { diffPixelThreshold, diffThreshold },
    storyboardOptions,
  };

  const parrelelTasks = parallelize ? parrelelTasks_ : 1;
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  const client = createClient({ apiToken });
  const cachedTestRunResults = useCache
    ? await getCachedTestRunResults({ client, commitSha })
    : [];
  const { testRun } = await runAllTests({
    testsFile: testsFile ?? null,
    executionOptions,
    screenshottingOptions,
    apiToken: apiToken ?? null,
    commitSha,
    baseCommitSha: baseCommitSha ?? null,
    appUrl: appUrl ?? null,
    useAssetsSnapshottedInBaseSimulation,
    parallelTasks: parrelelTasks ?? null,
    deflake,
    maxRetriesOnFailure,
    cachedTestRunResults,
    githubSummary,
  });

  if (testRun.status === "Failure") {
    process.exit(1);
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
        "Number of tasks to run in parallel (if not set a default value is used based on the number of CPUs)",
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
    maxRetriesOnFailure: {
      number: true,
      description:
        "If set to a value greater than 0 then will re-run any replays that give a screenshot diff and mark them as a flake if the screenshot generated on one of the retryed replays differs from that in the first replay.",
      default: 0,
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
