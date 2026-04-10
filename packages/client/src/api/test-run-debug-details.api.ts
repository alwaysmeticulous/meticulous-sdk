/**
 * We sometimes need to re-run the CI job for the base commit to (re-)compute Meticulous results for the base commit.
 *
 * The caller can optionally provide information on whether this happened or was required, and was successful or not.
 *
 * This is useful for debugging -- for example if the base isn't available.
 */
export type BaseResolutionDetails =
  | SuitableTestRunAlreadyExisted
  | WaitedForExistingWorkflowRun
  | RequiredNewWorkflowRunButFailedDueToNewCommitToBaseBranch
  | TriggeredNewWorkflowRunSuccessfully
  | FailedForOtherReason;

export type SuitableTestRunAlreadyExisted = {
  type: "suitable-test-run-already-existed";
  testRunId: string;
};

/**
 * We waited for the CI workflow to complete before calling this function, and it completed successfully.
 */
export type WaitedForExistingWorkflowRun = {
  type: "waited-for-existing-workflow-run";
  workflowId: string;
  baseCommitSha: string;
  msTaken: number;
};

/**
 * No suitable existing Meticulous results existed for the target base commit, and no existing CI workflow was running, and we were
 * not able to trigger a new CI workflow because the base branch had been updated to a new commit, and the CI system only supports
 * triggering new runs on the latest commit on the base branch.
 */
export type RequiredNewWorkflowRunButFailedDueToNewCommitToBaseBranch = {
  type: "required-new-workflow-run-but-failed-due-to-new-commit-to-base-branch";
  baseRef: string;
  targetBaseCommitSha: string;
  currentLastestBaseCommitSha: string;
};

/**
 * No suitable existing Meticulous results existed for the target base commit, and no existing CI workflow was running,
 * so we triggered a new CI workflow, waited for it to complete, and it completed successfully.
 */
export type TriggeredNewWorkflowRunSuccessfully = {
  type: "triggered-new-workflow-run-successfully";
  workflowId: string;
  msTaken: number;
};

/**
 * A catch all for more exceptional failures
 */
export type FailedForOtherReason = {
  type: "failed-for-other-reason";
  message: string;
};
