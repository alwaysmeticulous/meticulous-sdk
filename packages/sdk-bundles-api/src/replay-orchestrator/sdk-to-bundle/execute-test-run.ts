import {
  ScreenshotAssertionsEnabledOptions,
  TestRunEnvironment,
} from "@alwaysmeticulous/api";
import { LogLevelNumbers } from "loglevel";
import { RunningTestRunExecution } from "../bundle-to-sdk/execute-test-run";
import { ReplayExecutionOptions } from "./execute-replay";

export interface ExecuteTestRunOptions {
  chromeExecutablePath?: string;
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

  /**
   * If null runs in parralel with a sensible number of parrelel tasks for the given machine.
   *
   * Set to 1 to disable parralelism.
   */
  parallelTasks: number | null;

  /**
   * If set to a value greater than 1 then will re-run any replays that give a screenshot diff
   * and mark them as a flake if the screenshot generated on one of the retryed replays differs from that
   * in the first replay.
   */
  maxRetriesOnFailure: number;

  /**
   * If set to a value greater than 0 then will re-run all replays the specified number of times
   * and mark them as a flake if the screenshot generated on one of the retryed replays differs from that
   * in the first replay.
   *
   * This is useful for checking flake rates.
   *
   * This option is mutually exclusive with maxRetriesOnFailure.
   */
  rerunTestsNTimes: number;

  githubSummary: boolean;

  /**
   * Captured environment for this run
   */
  environment?: TestRunEnvironment;

  baseTestRunId: string | null;

  logLevel: LogLevelNumbers;

  onTestRunCreated?: (testRun: RunningTestRunExecution) => void;
  onTestFinished?: (testRun: RunningTestRunExecution) => void;

  /**
   * The maximum version of the executeTestRun schema (the types in this inferface
   * and the return type) that the caller is compatible with.
   *
   * This version number is bumped on every API change, and allows the executeTestRun
   * code to detect if it's being called by client that is not compatible with the latest version,
   * and if so throw an OutOfDateClientError. It is then up to the client to display a message to ask
   * the user to update to a newer version.
   *
   * Note: this is typed as a const of the latest known version, rather than a number, to ensure
   * that all clients bump the version number passed when they upgrade to the types.
   */
  maxSemanticVersionSupported: 1;

  /**
   * The version of the environment in which a replay is executed. This should be bumped
   * whenever the environment changes in a way that affects the replay, e.g. the version of
   * Chromium, or the version of Puppeteer.
   *
   * See `LogicVersioned` in `@alwaysmeticulous/api`.
   * Values are truncated to 8 bits, so must be in the range 0-255.
   */
  logicalEnvironmentVersion?: number;
}
