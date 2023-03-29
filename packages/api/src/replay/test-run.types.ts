import { Project } from "../project.types";
import { ScreenshotDiffOptions } from "./replay-diff.types";

/** Represents the configuration used for a test run */
export interface TestRunConfigData {
  testCases?: TestCase[];
  arguments?: TestRunArguments;
  environment?: TestRunEnvironment;
  [key: string]: unknown;
}

export interface TestCase {
  sessionId: string;
  title?: string;
  baseTestRunId?: string;
  options?: TestCaseReplayOptions;
}

export interface TestCaseReplayOptions extends Partial<ScreenshotDiffOptions> {
  appUrl?: string | null | undefined;

  /**
   * If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior replay, instead of against a URL.
   */
  simulationIdForAssets?: string | undefined;

  moveBeforeClick?: boolean;
}

export interface TestRunArguments {
  // TODO: pull types in this package to avoid 'unknown'.
  executionOptions?: unknown;
  screenshottingOptions?: unknown;

  commitSha?: string;
  baseCommitSha?: string | null;
  appUrl?: string | null;
  parallelTasks?: number | null;
  githubSummary?: boolean;
  [key: string]: unknown;
}

export interface TestRunEnvironment {
  ci?: boolean;
  context?: TestRunGitHubContext;
  [key: string]: unknown;
}

export type TestRunGitHubContext =
  | TestRunGitHubPullRequestContext
  | TestRunGitHubPushContext
  | TestRunGitHubWorkflowDispatchContext;

export interface TestRunGitHubPullRequestContext {
  type: "github";
  event: "pull-request";

  /** Pull request title */
  title: string;

  /** Pull request number */
  number: number;

  /** Pull request URL (web page) */
  htmlUrl: string;

  /** Base commit hash */
  baseSha: string;

  /** Head commit hash */
  headSha: string;
}

export interface TestRunGitHubPushContext {
  type: "github";
  event: "push";

  /** Commit hash before the push event */
  beforeSha: string;

  /** Commit hash after the push event */
  afterSha: string;

  /** Git ref (usually /refs/head/<branch>) */
  ref: string;
}

export interface TestRunGitHubWorkflowDispatchContext {
  type: "github";
  event: "workflow-dispatch";

  /** Git ref (usually /refs/head/<branch>) */
  ref: string;

  /** Workflow dispatch inputs */
  inputs: {
    [key: string]: unknown;
  };

  /** Resolved head commit hash */
  headSha: string;
}

export type TestRunStatus = "Running" | "Success" | "Failure";

export interface TestRun {
  id: string;
  status: TestRunStatus;
  project: Project;
  resultData?: {
    results: TestCaseResult[];
    [key: string]: any;
  };
  [key: string]: any;
}

export type TestCaseResultStatus = "pass" | "fail" | "flake";

export interface TestCaseResult extends TestCase {
  headReplayId: string;

  /**
   * A test case is marked as a flake if there were screenshot comparison failures,
   * but for every one of those failures regenerating the screenshot on head sometimes gave
   * a different screenshot to the original screenshot taken on head.
   */
  result: TestCaseResultStatus;
}
