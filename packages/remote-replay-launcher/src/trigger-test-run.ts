import type { TestRun } from "@alwaysmeticulous/api";
import type { AgentProjectOverride } from "@alwaysmeticulous/client";
import {
  agentTriggerTestRun,
  agentUploadGitDiffBuild,
  createClient,
  getApiToken,
} from "@alwaysmeticulous/client";
import { logProgress } from "@alwaysmeticulous/common";
import { uploadBufferToSignedUrl } from "./asset-upload-utils";

export interface TriggerTestRunOptions extends AgentProjectOverride {
  apiToken: string | null | undefined;
  /**
   * The deployment to test, as returned by `uploadBuild`. At least one of
   * `deploymentId` or `commitSha` must be provided.
   */
  deploymentId?: string | undefined;
  /**
   * Alternative to `deploymentId`: resolves to the most recent non-ephemeral
   * deployment already uploaded for this commit in the project. Can be
   * combined with `gitDiffOutput`: the diff upload resolves `commitSha` to a
   * deployment first, and that resolved id is then reused for the trigger
   * call too, so both requests target the same deployment row. Alongside
   * `deploymentId`, it is instead checked to be that deployment's commit.
   */
  commitSha?: string | undefined;
  /**
   * The base commit to compare against. Required unless `baseTestRunId` is
   * set, or the project has no connected repository: there, omitting both
   * triggers a baseline run that later runs on its commit compare against.
   */
  baseSha?: string | undefined;
  /**
   * The test run to compare against, instead of looking one up by `baseSha`
   * (which, if also set, must be its commit).
   */
  baseTestRunId?: string | undefined;
  /** Raw `git diff base..head` output. */
  gitDiffOutput?: string | undefined;
  /**
   * Optional explicit set of sessions to replay. When provided, the run replays
   * exactly these sessions (for both head and base) instead of the project's
   * auto-selected golden set.
   */
  sessionIds?: string[] | undefined;
  /**
   * Caps each session replay at this many seconds; sessions longer than the
   * cap are silently trimmed. Only applied when `sessionIds` is also set —
   * the backend rejects it otherwise. Defaults to 300 seconds (5 minutes)
   * when omitted; pass `null` for unlimited. Wins over any project-configured
   * cap.
   */
  maxDurationSeconds?: number | null | undefined;
}

export interface TriggerTestRunResult {
  testRun: TestRun | null;
  /** The head commit the run executed against (the deployment's commit). */
  headCommitSha: string | null;
}

/**
 * Builds the `{ deploymentId }` / `{ commitSha }` params to spread into a
 * request body. Both are sent when both are known: the backend then resolves
 * the deployment by id and checks it was built from `commitSha`.
 */
const identifierParams = (
  deploymentId: string | undefined,
  commitSha: string | undefined,
): { deploymentId?: string; commitSha?: string } => {
  if (!deploymentId && !commitSha) {
    throw new Error("Provide either deploymentId or commitSha.");
  }
  return {
    ...(deploymentId ? { deploymentId } : {}),
    ...(commitSha ? { commitSha } : {}),
  };
};

/**
 * Triggers a test run against a previously-uploaded deployment, uploading the
 * git diff (keyed by the deployment) first when provided.
 *
 * The backend resolves the base synchronously and the agent endpoint fails
 * (HTTP 422) rather than producing a baseless run, so there is no client-side
 * base polling: a single trigger call either returns a run with a base, or
 * rejects with a clear error. The one exception is a deliberate baseline run
 * (no base given) on a project with no connected repository.
 */
export const triggerTestRun = async ({
  apiToken: apiToken_,
  deploymentId,
  commitSha,
  baseSha,
  baseTestRunId,
  gitDiffOutput,
  sessionIds,
  maxDurationSeconds,
  project,
}: TriggerTestRunOptions): Promise<TriggerTestRunResult> => {
  if (!deploymentId && !commitSha) {
    throw new Error("At least one of deploymentId or commitSha is required.");
  }
  if (gitDiffOutput && !baseSha) {
    throw new Error("gitDiffOutput requires baseSha.");
  }
  const apiToken = getApiToken(apiToken_);
  const client = createClient({ apiToken });
  const projectOverride = project ? { project } : {};

  // Pins the deployment the diff was attached to, so the trigger call below
  // reuses that exact row instead of re-resolving `commitSha` a second time —
  // closing the race window where a newer deployment for that commit could be
  // uploaded between the two calls.
  let resolvedDeploymentId = deploymentId;
  if (gitDiffOutput && baseSha) {
    const buffer = Buffer.from(gitDiffOutput, "utf-8");
    logProgress(`Uploading git diff (${buffer.length} bytes)...`);
    const { uploadUrl, deploymentId: uploadedDeploymentId } =
      await agentUploadGitDiffBuild({
        client,
        ...identifierParams(deploymentId, commitSha),
        baseSha,
        size: buffer.length,
        ...projectOverride,
      });
    await uploadBufferToSignedUrl(uploadUrl, buffer, {
      contentType: "text/plain",
    });
    resolvedDeploymentId = uploadedDeploymentId;
  }

  const result = await agentTriggerTestRun({
    client,
    ...(resolvedDeploymentId && resolvedDeploymentId !== deploymentId
      ? { deploymentId: resolvedDeploymentId }
      : identifierParams(deploymentId, commitSha)),
    ...(baseSha ? { baseSha } : {}),
    ...(baseTestRunId ? { baseTestRunId } : {}),
    // Forward the list whenever it's present (even if empty) rather than
    // silently dropping an empty one: "provided" means "pin exactly these", so
    // an empty list is a caller mistake the backend rejects with a clear 400.
    ...(sessionIds != null ? { sessionIds } : {}),
    ...(maxDurationSeconds !== undefined ? { maxDurationSeconds } : {}),
    ...projectOverride,
  });

  const testRun = result.testRun ?? null;
  if (!testRun) {
    // The agent endpoint returns either a test run or a typed HTTP error (422
    // base-not-found, rate-limited, etc.) whose server message surfaces through
    // the client before we get here — so an empty-but-successful response is an
    // unexpected backend state, not a user-actionable failure.
    throw new Error(
      "The server reported success but returned no test run. This is unexpected — please retry, and contact Meticulous if it persists.",
    );
  }
  const headCommitSha = result.commitSha ?? null;

  // Use the backend-provided URL (built from its configured webapp base) rather
  // than hardcoding the production host, so it's correct on staging/local too.
  logProgress(`Test run triggered: ${testRun.url}`);

  return { testRun, headCommitSha };
};
