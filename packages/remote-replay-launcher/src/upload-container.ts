import type {
  CompanionAssetsInfo,
  TestRun,
  TestRunTriggerDebugContext,
} from "@alwaysmeticulous/api";
import type {
  ContainerEnvVariable,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import {
  getApiToken,
  createClient,
  getRegistryAuth,
  completeContainerUpload,
} from "@alwaysmeticulous/client";
import {
  executeWithRetry,
  initLogger,
  logProgress,
} from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import type Docker from "dockerode";
import {
  uploadAssets,
  uploadAssetsFromTarStream,
  uploadAssetsFromZip,
  uploadGitDiffToS3,
} from "./asset-upload-utils";
import {
  getDockerClient,
  getImageInfo,
  getTarStreamFromImage,
  pushImage,
  tagImage,
  verifyDockerConnection,
} from "./docker-utils";
import {
  DEPLOYMENT_IN_PROGRESS_RETRY,
  isDeploymentStillInProgress,
} from "./deployment-in-progress";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";
import type { CompanionAssetsOptions } from "./types";

export interface UploadContainerOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  localImageTag: string;
  commitSha: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  waitForBase?: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  companionAssets?: CompanionAssetsOptions | undefined;
  debugContext?: TestRunTriggerDebugContext;
}

export interface UploadContainerResult {
  uploadId: string;
  testRun?: TestRun | null;
  message?: string;
}

export interface PushContainerImageResult {
  client: ReturnType<typeof createClient>;
  uploadId: string;
  imageReference: string;
}

/**
 * Verifies, tags and pushes the local Docker image to the Meticulous registry,
 * returning the `uploadId` that identifies the pushed image. This is the
 * "upload the bytes" half of a container build — it does NOT register a
 * deployment or trigger a run. Shared by {@link uploadContainer} (deprecated
 * fused path) and the build/trigger split (`uploadBuild`).
 */
export const pushContainerImage = async ({
  apiToken: apiToken_,
  localImageTag,
  projectId,
}: {
  apiToken: string | null | undefined;
  localImageTag: string;
  projectId?: string | undefined;
}): Promise<PushContainerImageResult> => {
  const apiToken = getApiToken(apiToken_);
  const client = createClient({ apiToken });

  const projectIdentifier = projectId ? { projectId } : {};

  const docker = getDockerClient();

  logProgress("Verifying Docker connection...");
  await verifyDockerConnection(docker);
  logProgress("Docker connection verified");

  logProgress(`Verifying local Docker image: ${localImageTag}`);
  const imageInfo = await getImageInfo(docker, localImageTag);
  if (!imageInfo) {
    throw new Error(
      `Docker image '${localImageTag}' not found locally. Please build the image first.`,
    );
  }
  logProgress(`Found Docker image: ${localImageTag}`);

  logProgress("Getting registry credentials...");
  const registryAuth = await getRegistryAuth({
    client,
    ...projectIdentifier,
  });

  const {
    uploadId,
    imageReference,
    registryUrl,
    robotAccountName,
    robotAccountSecret,
  } = registryAuth;

  logProgress(`Registry: ${registryUrl}`);
  logProgress(`Upload ID: ${uploadId}`);
  logProgress(`Image reference: ${imageReference}`);

  logProgress("Tagging image for registry...");
  await tagImage(docker, localImageTag, imageReference);

  logProgress(`Pushing image to registry: ${imageReference}`);
  const authconfig: Docker.AuthConfig = {
    username: robotAccountName,
    password: robotAccountSecret,
    serveraddress: registryUrl,
  };

  // `tagImage` and `pushImage` each log their own success line, so we don't
  // repeat it here.
  await pushImage(docker, imageReference, authconfig);

  return { client, uploadId, imageReference };
};

export const uploadContainer = async ({
  apiToken: apiToken_,
  localImageTag,
  commitSha,
  baseSha,
  gitDiffOutput,
  waitForBase = false,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  companionAssets,
  projectId,
  debugContext,
}: UploadContainerOptions): Promise<UploadContainerResult> => {
  const projectIdentifier = projectId ? { projectId } : {};

  const { client, uploadId, imageReference } = await pushContainerImage({
    apiToken: apiToken_,
    localImageTag,
    projectId,
  });

  logProgress(
    `Completing container upload ${uploadId} for commit ${commitSha} and triggering test run...`,
  );

  if (gitDiffOutput) {
    await uploadGitDiffToS3({
      client,
      uploadId,
      gitDiffOutput,
      ...projectIdentifier,
    });
  }

  let companionAssetsInfo: CompanionAssetsInfo | undefined = undefined;
  if (companionAssets) {
    const { folder, zip, pathInImage, regex } = companionAssets;
    logProgress(
      `Uploading companion assets from ${folder ?? zip ?? pathInImage}`,
    );
    const opts = {
      apiToken: apiToken_,
      commitSha,
      waitForBase: false,
      rewrites: [],
      createDeployment: false,
      ...projectIdentifier,
    };
    const result = folder
      ? await uploadAssets({
          ...opts,
          appDirectory: folder,
          warnIfNoIndexHtml: false,
        })
      : zip
        ? await uploadAssetsFromZip({ ...opts, zipPath: zip })
        : pathInImage
          ? await uploadAssetsFromTarStream({
              ...opts,
              tarStream: await getTarStreamFromImage(
                getDockerClient(),
                localImageTag,
                pathInImage,
              ),
            })
          : undefined;
    if (!result) {
      throw new Error(
        "Expected one of folder, zip, or pathInImage to be provided!",
      );
    }
    companionAssetsInfo = {
      deploymentUploadId: result.uploadId,
      regex,
      archiveType: result.archiveType,
    };
    logProgress(`Companion assets uploaded with ID: ${result.uploadId}`);
  }

  const completeContainerArgs = {
    client,
    uploadId,
    commitSha,
    ...(baseSha ? { baseSha } : {}),
    ...(gitDiffOutput ? { hasGitDiff: true } : {}),
    mustHaveBase: waitForBase,
    containerPort,
    containerEnv,
    containerHealthCheckEndpoint,
    ...(companionAssetsInfo ? { companionAssetsInfo } : {}),
    ...projectIdentifier,
  };

  // Only on the first call: `debugContext` describes a decision the action made
  // before it uploaded anything, so it is the same on every poll below, and the
  // backend logs it each time it is sent.
  const firstAttemptArgs = {
    ...completeContainerArgs,
    ...(debugContext ? { debugContext } : {}),
  };

  const completeUpload = async (
    args: typeof firstAttemptArgs,
  ): ReturnType<typeof completeContainerUpload> => {
    try {
      return await completeContainerUpload(args);
    } catch (error) {
      // An in-progress answer is not a failure — whoever called this comes back
      // for it — so don't report it as one. The retry below and the base poll
      // loop both log their own, quieter, account of waiting.
      if (!isDeploymentStillInProgress(error)) {
        const logger = initLogger();
        logger.error(
          `Failed to complete container upload ${uploadId} for image ${imageReference} and commit ${commitSha}`,
        );
        if (error instanceof Error) {
          logger.error(error.message);
        }
      }
      throw error;
    }
  };

  // Same reasoning as the asset-upload path: this call runs the whole deployment
  // trigger synchronously, so it can outlast the gateway's response timeout and
  // lose its response while the trigger itself carries on. The endpoint is
  // idempotent, so keep coming back on a longer schedule rather than failing an
  // upload whose run is most likely already on its way.
  //
  // The polls in `pollWhileBaseNotFound` below reach the same endpoint but want
  // no retry of their own: that loop is already coming back every ten seconds,
  // so nesting a minute of waiting inside it would only slow it down. Its final
  // fallback call is the exception, and handles itself.
  const completeResult = await executeWithRetry(
    () => completeUpload(firstAttemptArgs),
    { ...DEPLOYMENT_IN_PROGRESS_RETRY, logger: initLogger() },
  );

  const pollResult = await pollWhileBaseNotFound({
    initialResult: {
      testRun: completeResult.testRun ?? null,
      baseNotFound: waitForBase ? completeResult.baseNotFound : false,
      extraBasePollTimeoutMs: completeResult.extraBasePollTimeoutMs,
      message: completeResult.message,
    },
    retryFn: () =>
      completeUpload({
        ...completeContainerArgs,
        mustHaveBase: true,
      }),
    fallbackFn: () => {
      logProgress(
        "No base test run found. Creating the test run without a base; no sessions will be executed.",
      );
      return completeUpload({
        ...completeContainerArgs,
        mustHaveBase: false,
      });
    },
  });

  const testRun = pollResult.testRun ?? null;
  const baseNotFound = pollResult.baseNotFound;
  const message = pollResult.message;

  if (testRun) {
    const organizationName = encodeURIComponent(
      testRun.project.organization.name,
    );
    const projectName = encodeURIComponent(testRun.project.name);
    const testRunUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/test-runs/${testRun.id}`;
    logProgress(`Test run triggered: ${testRunUrl}`);
  }

  Sentry.captureMessage("Container uploaded and deployment created", {
    level: "debug",
    extra: {
      uploadId,
      commitSha,
      testRunId: testRun?.id,
      baseNotFound,
      imageReference,
    },
  });

  logProgress(`Container upload completed. Upload ID: ${uploadId}`);

  return {
    uploadId,
    testRun,
    ...(message ? { message } : {}),
  };
};
