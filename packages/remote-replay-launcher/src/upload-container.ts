import type { TestRun } from "@alwaysmeticulous/api";
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
import { initLogger, logProgress } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import Docker from "dockerode";
import { uploadGitDiffToS3 } from "./asset-upload-utils";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";

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
  if (!apiToken) {
    throw new Error(
      "You must provide an API token by using the --apiToken parameter",
    );
  }

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
  projectId,
}: UploadContainerOptions): Promise<UploadContainerResult> => {
  const projectIdentifier = projectId ? { projectId } : {};

  const { client, uploadId, imageReference } = await pushContainerImage({
    apiToken: apiToken_,
    localImageTag,
    projectId,
  });

  logProgress("Completing container upload and triggering test run...");

  if (gitDiffOutput) {
    await uploadGitDiffToS3({
      client,
      uploadId,
      gitDiffOutput,
      ...projectIdentifier,
    });
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
    ...projectIdentifier,
  };

  const completeResult = await completeContainerUpload(completeContainerArgs);

  const pollResult = await pollWhileBaseNotFound({
    initialResult: {
      testRun: completeResult.testRun ?? null,
      baseNotFound: waitForBase ? completeResult.baseNotFound : false,
      message: completeResult.message,
    },
    retryFn: () =>
      completeContainerUpload({
        ...completeContainerArgs,
        mustHaveBase: true,
      }),
    fallbackFn: () => {
      logProgress("No base test run found, creating test run without base");
      return completeContainerUpload({
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

const getDockerClient = (): Docker => {
  return new Docker();
};

const verifyDockerConnection = async (docker: Docker): Promise<void> => {
  const logger = initLogger();
  try {
    await docker.ping();
  } catch (error) {
    logger.error(
      "Failed to connect to Docker daemon. Please ensure Docker is running and try again.",
    );
    if (error instanceof Error) {
      logger.error(`Docker error: ${error.message}`);
    }
    throw new Error(
      "Docker daemon is not running or unreachable. Please start Docker and try again.",
      { cause: error },
    );
  }
};

const getImageInfo = async (
  docker: Docker,
  imageTag: string,
  // oxlint-disable-next-line typescript-eslint/no-redundant-type-constituents -- dockerode types resolve under tsc; tsgolint false positive
): Promise<Docker.ImageInspectInfo | null> => {
  const logger = initLogger();
  try {
    const image = docker.getImage(imageTag);
    const imageInfo = await image.inspect();
    return imageInfo;
  } catch (error) {
    logger.error(`Failed to find Docker image: ${imageTag}`);
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
    }
    return null;
  }
};

const tagImage = async (
  docker: Docker,
  sourceImage: string,
  targetImage: string,
): Promise<void> => {
  const logger = initLogger();
  try {
    const image = docker.getImage(sourceImage);
    const [repo, tag] = targetImage.split(":");
    await image.tag({ repo, tag: tag || "latest" });
    logProgress(`Tagged image ${sourceImage} as ${targetImage}`);
  } catch (error) {
    logger.error(`Failed to tag image ${sourceImage} as ${targetImage}`);
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
    }
    throw new Error(`Failed to tag Docker image: ${error}`, { cause: error });
  }
};

const pushImage = async (
  docker: Docker,
  imageReference: string,
  authconfig: Docker.AuthConfig,
): Promise<void> => {
  const logger = initLogger();

  return new Promise((resolve, reject) => {
    const image = docker.getImage(imageReference);

    image.push({ authconfig }, (err, stream) => {
      if (err) {
        logger.error(`Failed to push image ${imageReference}`);
        logger.error(`Error: ${err.message}`);
        reject(new Error(`Failed to push Docker image: ${err.message}`));
        return;
      }

      if (!stream) {
        reject(new Error("No stream returned from Docker push"));
        return;
      }

      docker.modem.followProgress(stream, (err) => {
        if (err) {
          logger.error(`Error during image push: ${err.message}`);
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        logProgress(`Successfully pushed image ${imageReference}`);
        resolve();
      });
    });
  });
};
