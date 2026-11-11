import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type {
  UploadContainerAndTriggerTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";
import { uploadContainer } from "./upload-container";
import { describeGitHubRateLimitRetry } from "./github-rate-limit-retry";

export const uploadContainerAndTriggerTestRun = async ({
  apiToken,
  localImageTag,
  commitSha,
  waitForBase,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  companionAssets,
  projectId,
  debugContext,
}: UploadContainerAndTriggerTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = initLogger();

  const result = await uploadContainer({
    apiToken,
    localImageTag,
    commitSha,
    waitForBase,
    containerPort,
    containerEnv,
    containerHealthCheckEndpoint,
    ...(companionAssets ? { companionAssets } : {}),
    ...(projectId ? { projectId } : {}),
    ...(debugContext ? { debugContext } : {}),
  });

  let skipReason: ExecuteRemoteTestRunResult["skipReason"];
  let skipMessage: string | undefined;
  if (result.testRun) {
    const organizationName = encodeURIComponent(
      result.testRun.project.organization.name,
    );
    const projectName = encodeURIComponent(result.testRun.project.name);
    const testRunUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/test-runs/${result.testRun.id}`;
    logNotice(`Test run triggered: ${testRunUrl}`);
  } else if (result.commentsDisabledForAuthor) {
    skipReason = "comments_disabled_for_author";
    skipMessage =
      result.message ??
      "Test run skipped because CI comments and checks are disabled for this pull request author.";
    logger.info(skipMessage);
  } else if (result.githubRateLimitRetryScheduled) {
    skipReason = "github_rate_limit_retry_scheduled";
    skipMessage = describeGitHubRateLimitRetry(result.message);
    logNotice(skipMessage);
  } else {
    throw new Error(`${result.message ?? "Test run was not created"}`);
  }

  return {
    testRun: result.testRun ?? null,
    ...(skipReason ? { skipReason } : {}),
    ...(skipMessage ? { message: skipMessage } : {}),
  };
};
