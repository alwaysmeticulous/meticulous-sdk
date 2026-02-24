import {
  getApiToken,
  createClient,
  getRegistryAuth,
  completeContainerUpload,
  TestRun,
  ContainerEnvVariable,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import Docker from "dockerode";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";

export interface UploadContainerOptions {
  apiToken: string | null | undefined;
  localImageTag: string;
  commitSha: string;
  waitForBase?: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
}

export interface UploadContainerResult {
  uploadId: string;
  testRun?: TestRun | null;
  message?: string;
}

export const uploadContainer = async ({
  apiToken: apiToken_,
  localImageTag,
  commitSha,
  waitForBase = false,
  containerPort,
  containerEnv,
}: UploadContainerOptions): Promise<UploadContainerResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });

  const docker = getDockerClient();

  logger.info("Verifying Docker connection...");
  await verifyDockerConnection(docker);
  logger.info("Docker connection verified");

  logger.info(`Verifying local Docker image: ${localImageTag}`);
  const imageInfo = await getImageInfo(docker, localImageTag);
  if (!imageInfo) {
    throw new Error(
      `Docker image '${localImageTag}' not found locally. Please build the image first.`,
    );
  }
  logger.info(`Found Docker image: ${localImageTag}`);

  logger.info("Getting registry credentials...");
  const registryAuth = await getRegistryAuth({ client });

  const {
    uploadId,
    imageReference,
    registryUrl,
    robotAccountName,
    robotAccountSecret,
  } = registryAuth;

  logger.info(`Registry: ${registryUrl}`);
  logger.info(`Upload ID: ${uploadId}`);
  logger.info(`Image reference: ${imageReference}`);

  logger.info("Tagging image for registry...");
  await tagImage(docker, localImageTag, imageReference);
  logger.info(`Tagged image as ${imageReference}`);

  logger.info(`Pushing image to registry: ${imageReference}`);
  const authconfig: Docker.AuthConfig = {
    username: robotAccountName,
    password: robotAccountSecret,
    serveraddress: registryUrl,
  };

  await pushImage(docker, imageReference, authconfig);
  logger.info(`Successfully pushed image ${imageReference}`);

  logger.info("Completing container upload and triggering test run...");

  const completeResult = await completeContainerUpload({
    client,
    uploadId,
    commitSha,
    mustHaveBase: waitForBase,
    containerPort,
    containerEnv,
  });

  const pollResult = await pollWhileBaseNotFound({
    initialResult: {
      testRun: completeResult.testRun ?? null,
      baseNotFound: waitForBase ? completeResult.baseNotFound : false,
      message: completeResult.message,
    },
    retryFn: () =>
      completeContainerUpload({
        client,
        uploadId,
        commitSha,
        mustHaveBase: true,
        containerPort,
        containerEnv,
      }),
    fallbackFn: () => {
      logger.info("No base test run found, creating test run without base");
      return completeContainerUpload({
        client,
        uploadId,
        commitSha,
        mustHaveBase: false,
        containerPort,
        containerEnv,
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
    logger.info(`Test run triggered: ${testRunUrl}`);
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

  logger.info(`Container upload completed. Upload ID: ${uploadId}`);

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
    );
  }
};

const getImageInfo = async (
  docker: Docker,
  imageTag: string,
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
    logger.info(`Tagged image ${sourceImage} as ${targetImage}`);
  } catch (error) {
    logger.error(`Failed to tag image ${sourceImage} as ${targetImage}`);
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
    }
    throw new Error(`Failed to tag Docker image: ${error}`);
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
          reject(err);
          return;
        }
        logger.info(`Successfully pushed image ${imageReference}`);
        resolve();
      });
    });
  });
};
