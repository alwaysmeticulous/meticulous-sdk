import { initLogger } from "@alwaysmeticulous/common";
import { uploadContainer } from "./container-upload-utils";
import {
  UploadContainerAndTriggerTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";

export const uploadContainerAndTriggerTestRun = async ({
  apiToken,
  localImageTag,
  commitSha,
  waitForBase,
}: UploadContainerAndTriggerTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = initLogger();

  const result = await uploadContainer({
    apiToken,
    localImageTag,
    commitSha,
    waitForBase,
  });

  if (result.testRun) {
    const organizationName = encodeURIComponent(
      result.testRun.project.organization.name
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
