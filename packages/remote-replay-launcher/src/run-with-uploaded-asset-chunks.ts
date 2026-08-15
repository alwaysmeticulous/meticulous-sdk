import type {
  AssetUploadMetadata,
  SessionFilter,
  TestRun,
} from "@alwaysmeticulous/api";
import type {
  ChunkPathOverlap,
  createClient,
  RequestedProjectAssetChunkReference,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import {
  createRunWithUploadedAssetChunks,
  triggerRunWithUploadedAssetChunks,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { uploadGitDiffToS3 } from "./asset-upload-utils";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";

export interface RunWithUploadedAssetChunksOptions extends ProjectIdentifier {
  client: ReturnType<typeof createClient>;
  commitSha: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  waitForBase: boolean;
  rewrites: AssetUploadMetadata["rewrites"];
  createDeployment?: boolean;
  assetReferencesManifest: RequestedProjectAssetChunkReference[];
  /**
   * When set, the run only replays the sessions matching the filter (applied
   * to both the head run and any base run created to compare against).
   */
  sessionFilter?: SessionFilter | undefined;
}

export interface RunWithUploadedAssetChunksResult {
  testRun: TestRun | null;
  message?: string;
  overlaps?: ChunkPathOverlap[];
  overlapsTruncated?: boolean;
}

/**
 * Two-phase chunked-asset-upload run: (1) create the deployment row and obtain
 * the server-generated id, (2) upload the git diff to S3 keyed by that id, then
 * trigger the run, polling for the base test run with the same retry/fallback
 * shape as `completeUploadAndWaitForBase` in `asset-upload-utils`.
 */
export const runWithUploadedAssetChunks = async ({
  client,
  commitSha,
  baseSha,
  gitDiffOutput,
  waitForBase,
  rewrites,
  createDeployment = true,
  assetReferencesManifest,
  sessionFilter,
  projectId,
}: RunWithUploadedAssetChunksOptions): Promise<RunWithUploadedAssetChunksResult> => {
  const logger = initLogger();

  // Phase 1: create the deployment row and get back the server-generated id.
  // No replay is triggered yet — that happens in phase 2, after the git diff
  // (if any) has been uploaded to S3 keyed by this id.
  const { sourceDeploymentId, overlaps, overlapsTruncated } =
    await createRunWithUploadedAssetChunks({
      client,
      commitSha,
      createDeployment,
      assetReferencesManifest,
      rewrites,
      ...(projectId ? { projectId } : {}),
    });

  // Dry run (createDeployment: false) creates no deployment, so there is no
  // diff to upload and no run to trigger — just surface the upload endpoint's
  // best-effort (concrete-only) overlap preview.
  if (createDeployment === false || !sourceDeploymentId) {
    const dryRunOverlaps =
      overlaps && overlaps.length > 0
        ? {
            overlaps,
            ...(overlapsTruncated ? { overlapsTruncated: true } : {}),
          }
        : {};
    return { testRun: null, ...dryRunOverlaps };
  }

  // Upload the git diff to S3, keyed by the deployment id, so the replay can
  // read it. Mirrors uploadAssetsStreaming / uploadContainerAndTriggerTestRun.
  if (gitDiffOutput) {
    await uploadGitDiffToS3({
      client,
      uploadId: sourceDeploymentId,
      gitDiffOutput,
      ...(projectId ? { projectId } : {}),
    });
  }

  // Phase 2: trigger the run against the created deployment, polling for the
  // base test run with the same retry/fallback shape as the asset upload flow.
  const args = {
    client,
    sourceDeploymentId,
    commitSha,
    ...(baseSha ? { baseSha } : {}),
    ...(gitDiffOutput ? { hasGitDiff: true } : {}),
    mustHaveBase: waitForBase,
    ...(sessionFilter ? { sessionFilter } : {}),
    ...(projectId ? { projectId } : {}),
  };

  const manifestHasVersionLookups = assetReferencesManifest.some(
    (ref) => "versionLookup" in ref,
  );
  const fallbackFn = manifestHasVersionLookups
    ? () =>
        Promise.resolve({
          testRun: null,
          baseNotFound: true,
          message:
            "Timed out waiting for a base test run to appear for the base commit. This manifest contains versionLookup entries, which resolve chunk versions from the base commit's test run — that run only needs to exist (an in-progress run is fine), not to finish. If the base run is being created in parallel it may just be slightly behind, so retrying often succeeds. If it keeps failing, check that a chunked-asset Meticulous run is actually triggered for the base commit (and, if you passed --baseSha, that it points at the right commit).",
        })
    : () => triggerRunWithUploadedAssetChunks({ ...args, mustHaveBase: false });

  const initialResult = await triggerRunWithUploadedAssetChunks(args);
  const {
    testRun,
    baseNotFound,
    message,
    overlaps: triggerOverlaps,
    overlapsTruncated: triggerOverlapsTruncated,
  } = await pollWhileBaseNotFound({
    initialResult: {
      testRun: initialResult?.testRun ?? null,
      baseNotFound: initialResult?.baseNotFound,
      extraBasePollTimeoutMs: initialResult?.extraBasePollTimeoutMs,
      message: initialResult?.message,
      overlaps: initialResult?.overlaps,
      overlapsTruncated: initialResult?.overlapsTruncated,
    },
    retryFn: () => triggerRunWithUploadedAssetChunks(args),
    fallbackFn,
    ...(manifestHasVersionLookups
      ? {
          fallbackLogMessage:
            "Timed out waiting for a base test run. Not proceeding without a base because this manifest uses versionLookup entries, which require one.",
        }
      : {}),
  });

  // The trigger computes overlaps over the fully resolved manifest and is the
  // single authoritative source for a real run — an omitted/empty result means
  // no collisions (the concrete-only phase-1 preview is used only for dry runs).
  const resolvedOverlaps =
    triggerOverlaps && triggerOverlaps.length > 0
      ? {
          overlaps: triggerOverlaps,
          ...(triggerOverlapsTruncated ? { overlapsTruncated: true } : {}),
        }
      : {};

  Sentry.captureMessage("Test run triggered against uploaded asset chunks", {
    level: "debug",
    extra: {
      commitSha,
      testRunId: testRun?.id,
      baseNotFound,
      chunkCount: assetReferencesManifest.length,
    },
  });
  logger.info(
    `Test run triggered against ${assetReferencesManifest.length} uploaded asset chunk(s)`,
  );

  return {
    testRun: testRun ?? null,
    ...(message ? { message } : {}),
    ...resolvedOverlaps,
  };
};
