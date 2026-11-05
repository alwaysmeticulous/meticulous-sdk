import { rm } from "fs/promises";
import { dirname } from "path";
import {
  type createClient,
  type ProjectIdentifier,
  putFileToSignedUrl,
  requestAgentSwarmSourceBundleUpload,
  retryTransientUploadErrors,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { createSourceBundle } from "./create-source-bundle";

export interface UploadedSourceBundle {
  sourceBundleId: string;
  baseSha: string;
  headSha: string;
}

/**
 * Bundles the change between `baseSha` and `headSha` in `repoDirectory` (see
 * {@link createSourceBundle}) and uploads it for an Agent swarm launch on a
 * project without a hosting provider.
 */
export const uploadSourceBundle = async ({
  client,
  repoDirectory,
  baseSha,
  headSha,
  projectId,
}: ProjectIdentifier & {
  client: ReturnType<typeof createClient>;
  repoDirectory: string;
  baseSha: string;
  headSha: string;
}): Promise<UploadedSourceBundle> => {
  const logger = initLogger();
  const bundle = await createSourceBundle({ repoDirectory, baseSha, headSha });
  try {
    logger.info(
      `Uploading the source of ${bundle.baseSha.slice(0, 12)}..${bundle.headSha.slice(0, 12)} (${bundle.sizeBytes} bytes)...`,
    );
    const { uploadUrl, sourceBundleId } =
      await requestAgentSwarmSourceBundleUpload({
        client,
        size: bundle.sizeBytes,
        ...(projectId ? { projectId } : {}),
      });
    await retryTransientUploadErrors(() =>
      putFileToSignedUrl({
        filePath: bundle.path,
        signedUrl: uploadUrl,
        size: bundle.sizeBytes,
        contentType: "application/octet-stream",
      }),
    );
    logger.info("Source uploaded");
    return {
      sourceBundleId,
      baseSha: bundle.baseSha,
      headSha: bundle.headSha,
    };
  } finally {
    await rm(dirname(bundle.path), { recursive: true, force: true });
  }
};
