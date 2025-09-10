import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { uploadAssets } from "./asset-upload-utils";
import {
  UploadAssetsAndTriggerTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";

export const uploadAssetsAndTriggerTestRun = async ({
  apiToken: apiToken_,
  appDirectory,
  commitSha,
  rewrites,
  waitForBase,
}: UploadAssetsAndTriggerTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const result = await uploadAssets({
    apiToken: apiToken_,
    appDirectory,
    warnIfNoIndexHtml: !rewrites || rewrites.length === 0,
    commitSha,
    waitForBase,
    rewrites: rewrites ?? [],
    createDeployment: true,
  });

  if (result.testRun) {
    const organizationName = encodeURIComponent(
      result.testRun.project.organization.name,
    );
    const projectName = encodeURIComponent(result.testRun.project.name);
    const testRunUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/test-runs/${result.testRun.id}`;
    logger.info(`Test run triggered: ${testRunUrl}`);
  } else {
    throw new Error(`${result.message ?? "Test run was not created"}`);
  }

  return {
    testRun: result.testRun ?? null,
  };
};
