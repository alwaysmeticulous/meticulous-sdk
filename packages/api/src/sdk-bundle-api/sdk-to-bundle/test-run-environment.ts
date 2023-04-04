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
