import { initLogger, logNotice } from "@alwaysmeticulous/common";
import { uploadAssets, uploadAssetsFromZip } from "./asset-upload-utils";
import type {
  UploadAssetsAndTriggerTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";

export const uploadAssetsAndTriggerTestRun = async ({
  apiToken,
  appDirectory,
  appZip,
  commitSha,
  baseSha,
  gitDiffOutput,
  rewrites,
  waitForBase,
  projectId,
  debugContext,
}: UploadAssetsAndTriggerTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = initLogger();

  const opts = {
    apiToken,
    appDirectory,
    warnIfNoIndexHtml: !rewrites || rewrites.length === 0,
    commitSha,
    baseSha,
    gitDiffOutput,
    waitForBase,
    rewrites: rewrites ?? [],
    createDeployment: true,
    ...(projectId ? { projectId } : {}),
    ...(debugContext ? { debugContext } : {}),
  };

  const result = appDirectory
    ? await uploadAssets({ ...opts, appDirectory })
    : appZip
      ? await uploadAssetsFromZip({ ...opts, zipPath: appZip })
      : undefined;

  if (!result) {
    throw new Error("Expected either appDirectory or appZip to be provided");
  }

  let skipMessage: string | undefined;
  if (result.testRun) {
    const organizationName = encodeURIComponent(
      result.testRun.project.organization.name,
    );
    const projectName = encodeURIComponent(result.testRun.project.name);
    const testRunUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/test-runs/${result.testRun.id}`;
    logNotice(`Test run triggered: ${testRunUrl}`);
  } else if (result.commentsDisabledForAuthor) {
    skipMessage =
      result.message ??
      "Test run skipped because CI comments and checks are disabled for this pull request author.";
    logger.info(skipMessage);
  } else {
    throw new Error(`${result.message ?? "Test run was not created"}`);
  }

  return {
    testRun: result.testRun ?? null,
    ...(result.commentsDisabledForAuthor
      ? {
          skipReason: "comments_disabled_for_author" as const,
          ...(skipMessage ? { message: skipMessage } : {}),
        }
      : {}),
  };
};
