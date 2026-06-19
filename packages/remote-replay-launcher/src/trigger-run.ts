import { TestRun } from "@alwaysmeticulous/api";
import {
  agentRequestGitDiffUpload,
  agentTriggerTestRun,
  createClient,
  getApiToken,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { uploadBufferToSignedUrl } from "./asset-upload-utils";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";

export interface TriggerRunOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  /** The deployment to test, as returned by `uploadBuild`. */
  deploymentId: string;
  baseSha?: string | undefined;
  /** Raw `git diff base..head` output. Requires `baseSha`. */
  gitDiffOutput?: string | undefined;
  withUncommittedChanges?: boolean | undefined;
  /**
   * If true, try to wait for a base test run to be created before triggering;
   * fall back to triggering without a base if none appears.
   */
  waitForBase: boolean;
}

export interface TriggerRunResult {
  testRun: TestRun | null;
}

/**
 * Triggers a test run against a previously-uploaded deployment. Uploads the git
 * diff (keyed by the deployment) when provided, then triggers — polling for a
 * base test run when `waitForBase` is set.
 */
export const triggerRun = async ({
  apiToken: apiToken_,
  deploymentId,
  baseSha,
  gitDiffOutput,
  withUncommittedChanges,
  waitForBase,
  projectId,
}: TriggerRunOptions): Promise<TriggerRunResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }
  const client = createClient({ apiToken });
  const projectIdentifier = projectId ? { projectId } : {};

  if (gitDiffOutput) {
    const buffer = Buffer.from(gitDiffOutput, "utf-8");
    logger.info(`Uploading git diff (${buffer.length} bytes)...`);
    const { uploadUrl } = await agentRequestGitDiffUpload({
      client,
      deploymentId,
      size: buffer.length,
      ...projectIdentifier,
    });
    await uploadBufferToSignedUrl(uploadUrl, buffer, {
      contentType: "text/plain",
    });
  }

  const triggerArgs = {
    client,
    deploymentId,
    ...(baseSha ? { baseSha } : {}),
    ...(gitDiffOutput ? { hasGitDiff: true } : {}),
    ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
    mustHaveBase: waitForBase,
    ...projectIdentifier,
  };

  const initialResult = await agentTriggerTestRun(triggerArgs);

  const pollResult = await pollWhileBaseNotFound({
    initialResult: {
      testRun: initialResult.testRun ?? null,
      baseNotFound: waitForBase ? initialResult.baseNotFound : false,
      message: initialResult.message,
    },
    retryFn: () => agentTriggerTestRun({ ...triggerArgs, mustHaveBase: true }),
    fallbackFn: () => {
      logger.info("No base test run found, creating test run without base");
      return agentTriggerTestRun({ ...triggerArgs, mustHaveBase: false });
    },
  });

  const testRun = pollResult.testRun ?? null;
  if (!testRun) {
    throw new Error(`${pollResult.message ?? "Test run was not created"}`);
  }

  const organizationName = encodeURIComponent(
    testRun.project.organization.name,
  );
  const projectName = encodeURIComponent(testRun.project.name);
  const testRunUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/test-runs/${testRun.id}`;
  logger.info(`Test run triggered: ${testRunUrl}`);

  return { testRun };
};
