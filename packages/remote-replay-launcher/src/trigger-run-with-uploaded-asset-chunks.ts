import { AssetUploadMetadata, TestRun } from "@alwaysmeticulous/api";
import {
  ChunkPathOverlap,
  createClient,
  ProjectAssetChunkReference,
  ProjectIdentifier,
  runWithUploadedAssetChunks,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";

export interface TriggerRunWithUploadedAssetChunksOptions
  extends ProjectIdentifier {
  client: ReturnType<typeof createClient>;
  commitSha: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  withUncommittedChanges?: boolean | undefined;
  waitForBase: boolean;
  rewrites: AssetUploadMetadata["rewrites"];
  createDeployment?: boolean;
  assetReferencesManifest: ProjectAssetChunkReference[];
}

export interface TriggerRunWithUploadedAssetChunksResult {
  testRun: TestRun | null;
  message?: string;
  overlaps?: ChunkPathOverlap[];
  overlapsTruncated?: boolean;
}

/**
 * Calls the `run-with-uploaded-asset-chunks` endpoint and, if the base test
 * run hasn't surfaced yet, polls for it with the same retry/fallback shape
 * as `completeUploadAndWaitForBase` in `asset-upload-utils`.
 */
export const triggerRunWithUploadedAssetChunks = async ({
  client,
  commitSha,
  baseSha,
  gitDiffOutput,
  withUncommittedChanges,
  waitForBase,
  rewrites,
  createDeployment = true,
  assetReferencesManifest,
  projectId,
}: TriggerRunWithUploadedAssetChunksOptions): Promise<TriggerRunWithUploadedAssetChunksResult> => {
  const logger = initLogger();

  const args = {
    client,
    commitSha,
    ...(baseSha ? { baseSha } : {}),
    ...(gitDiffOutput ? { hasGitDiff: true } : {}),
    ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
    mustHaveBase: waitForBase,
    rewrites,
    createDeployment,
    assetReferencesManifest,
    ...(projectId ? { projectId } : {}),
  };

  const initialResult = await runWithUploadedAssetChunks(args);
  const { testRun, baseNotFound, message } = await pollWhileBaseNotFound({
    initialResult: {
      testRun: initialResult?.testRun ?? null,
      baseNotFound: initialResult?.baseNotFound,
      message: initialResult?.message,
    },
    retryFn: () => runWithUploadedAssetChunks(args),
    fallbackFn: () =>
      runWithUploadedAssetChunks({ ...args, mustHaveBase: false }),
  });
  // Overlaps are computed on the initial response only; they describe the
  // manifest itself, which doesn't change across poll retries.
  const overlaps = initialResult?.overlaps;
  const overlapsTruncated = initialResult?.overlapsTruncated;

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
    ...(overlaps && overlaps.length > 0
      ? {
          overlaps,
          ...(overlapsTruncated ? { overlapsTruncated: true } : {}),
        }
      : {}),
  };
};
