import type { TestRun } from "@alwaysmeticulous/api";
import type { ProjectIdentifier } from "@alwaysmeticulous/client";
import {
  agentTriggerTestRun,
  agentUploadGitDiffBuild,
  createClient,
  getApiToken,
} from "@alwaysmeticulous/client";
import { logProgress } from "@alwaysmeticulous/common";
import { uploadBufferToSignedUrl } from "./asset-upload-utils";

export interface TriggerTestRunOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  /**
   * The deployment to test, as returned by `uploadBuild`. Exactly one of
   * `deploymentId` or `commitSha` must be provided.
   */
  deploymentId?: string | undefined;
  /**
   * Alternative to `deploymentId`: resolves to the most recent non-ephemeral
   * deployment already uploaded for this commit in the project. Cannot be
   * combined with `gitDiffOutput`, since uploading a diff requires an
   * already-known deployment to key it by.
   */
  commitSha?: string | undefined;
  /** Required: an agent (custom-trigger) run is only useful with a base. */
  baseSha: string;
  /** Raw `git diff base..head` output. */
  gitDiffOutput?: string | undefined;
  /**
   * Optional explicit set of sessions to replay. When provided, the run replays
   * exactly these sessions (for both head and base) instead of the project's
   * auto-selected golden set.
   */
  sessionIds?: string[] | undefined;
}

export interface TriggerTestRunResult {
  testRun: TestRun | null;
  /** The head commit the run executed against (the deployment's commit). */
  headCommitSha: string | null;
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
export const triggerTestRun = async ({
  apiToken: apiToken_,
  deploymentId,
  commitSha,
  baseSha,
  gitDiffOutput,
  sessionIds,
  projectId,
}: TriggerTestRunOptions): Promise<TriggerTestRunResult> => {
  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    throw new Error(
      "You must provide an API token by using the --apiToken parameter",
    );
  }
  if (gitDiffOutput && !deploymentId) {
    // Uploading a diff requires an already-known deploymentId to key it by
    // (see agentUploadGitDiffBuild); a commitSha is only resolved to a
    // deployment server-side, at trigger time.
    throw new Error(
      "gitDiffOutput requires an explicit deploymentId (from `uploadBuild`); it cannot be combined with commitSha.",
    );
  }
  const client = createClient({ apiToken });
  const projectIdentifier = projectId ? { projectId } : {};

  if (gitDiffOutput && deploymentId) {
    const buffer = Buffer.from(gitDiffOutput, "utf-8");
    logProgress(`Uploading git diff (${buffer.length} bytes)...`);
    const { uploadUrl } = await agentUploadGitDiffBuild({
      client,
      deploymentId,
      baseSha,
      size: buffer.length,
      ...projectIdentifier,
    });
    await uploadBufferToSignedUrl(uploadUrl, buffer, {
      contentType: "text/plain",
    });
  }

  const result = await agentTriggerTestRun({
    client,
    ...(deploymentId ? { deploymentId } : {}),
    ...(commitSha ? { commitSha } : {}),
    baseSha,
    // Forward the list whenever it's present (even if empty) rather than
    // silently dropping an empty one: "provided" means "pin exactly these", so
    // an empty list is a caller mistake the backend rejects with a clear 400.
    ...(sessionIds != null ? { sessionIds } : {}),
    ...projectIdentifier,
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
