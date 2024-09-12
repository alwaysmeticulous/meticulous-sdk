export interface TestRunEnvironment {
  ci?: boolean;
  context?: TestRunGitHubContext | TestRunGitLabContext;
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

  /** Base ref (usually /refs/head/<branch>) */
  baseRef?: string;

  /** Head commit hash */
  headSha: string;

  /** Head ref (usually /refs/head/<branch>) */
  headRef?: string;

  /** GitHub Actions run ID that triggered this test run */
  runId?: number;
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

  /** GitHub Actions run ID that triggered this test run */
  runId?: number;
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

  /** GitHub Actions run ID that triggered this test run */
  runId?: number;
}

export type TestRunGitLabContext =
  | TestRunGitLabMergeRequestContext
  | TestRunGitLabPushContext;

export interface TestRunGitLabMergeRequestContext {
  type: "gitlab";
  event: "merge-request";

  /** Merge request title */
  title: string;

  /** Merge request number */
  internalId: number;

  /** Base commit hash */
  baseSha: string;

  /** Head commit hash */
  headSha: string;

  /** Merge request URL (web page) */
  webUrl: string;

  /** Git ref for the target branch (/refs/head/<target_branch>). Not defined for merge requests prior to July 2024. */
  baseRef?: string;

  /** Git ref for the source branch (/refs/head/<source_branch>). Not defined for merge requests prior to July 2024. */
  headRef?: string;
}

export interface TestRunGitLabPushContext {
  type: "gitlab";
  event: "push";

  /** Commit hash before the push event */
  beforeSha: string;

  /** Commit hash after the push event */
  afterSha: string;

  /** Git ref for the branch (/refs/head/<branch>). Not defined for pushes prior to July 2024. */
  ref?: string;
}
