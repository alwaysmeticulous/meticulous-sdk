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

export interface TriggerRunOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  /** The deployment to test, as returned by `uploadBuild`. */
  deploymentId: string;
  baseSha?: string | undefined;
  /** Raw `git diff base..head` output. Requires `baseSha`. */
  gitDiffOutput?: string | undefined;
  withUncommittedChanges?: boolean | undefined;
}

export interface TriggerRunResult {
  testRun: TestRun | null;
}

/**
 * Triggers a test run against a previously-uploaded deployment, uploading the
 * git diff (keyed by the deployment) first when provided.
 *
 * The backend resolves the base synchronously and the agent endpoint fails
 * (HTTP 422) rather than producing a baseless run, so there is no client-side
 * base polling: a single trigger call either returns a run with a base, or
 * rejects with a clear error.
 */
export const triggerRun = async ({
  apiToken: apiToken_,
  deploymentId,
  baseSha,
  gitDiffOutput,
  withUncommittedChanges,
  projectId,
}: TriggerRunOptions): Promise<TriggerRunResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    throw new Error(
      "You must provide an API token by using the --apiToken parameter",
    );
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

  const result = await agentTriggerTestRun({
    client,
    deploymentId,
    ...(baseSha ? { baseSha } : {}),
    ...(gitDiffOutput ? { hasGitDiff: true } : {}),
    ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
    ...projectIdentifier,
  });

  const testRun = result.testRun ?? null;
  if (!testRun) {
    throw new Error(`${result.message ?? "Test run was not created"}`);
  }

  const organizationName = encodeURIComponent(
    testRun.project.organization.name,
  );
  const projectName = encodeURIComponent(testRun.project.name);
  const testRunUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/test-runs/${testRun.id}`;
  logger.info(`Test run triggered: ${testRunUrl}`);

  return { testRun };
};
