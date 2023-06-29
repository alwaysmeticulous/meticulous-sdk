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

export type TestRunGitLabContext = TestRunGitLabMergeRequestContext;
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
}
