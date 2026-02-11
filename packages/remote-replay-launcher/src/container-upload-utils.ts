import { Readable } from "stream";
import {
  getApiToken,
  createClient,
  getRegistryAuth,
  completeContainerUpload,
  TestRun,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import Docker from "dockerode";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface DockerPushProgress {
  status: string;
  progress?: string;
  progressDetail?: {
    current?: number;
    total?: number;
  };
  id?: string;
  error?: string;
}

export interface UploadContainerCallbacks {
  onPushProgress?: (progress: DockerPushProgress) => void;
}

export interface UploadContainerOptions {
  apiToken: string | null | undefined;
  localImageTag: string;
  commitSha: string;
  waitForBase?: boolean;
  callbacks?: UploadContainerCallbacks;
}

export interface UploadContainerResult {
  uploadId: string;
  testRun?: TestRun | null;
  message?: string;
}

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
  onProgress?: (progress: DockerPushProgress) => void,
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

      let lastProgressStr = "";

      docker.modem.followProgress(
        stream as Readable,
        (err) => {
          if (err) {
            logger.error(`Error during image push: ${err.message}`);
            reject(err);
            return;
          }
          logger.info(`Successfully pushed image ${imageReference}`);
          resolve();
        },
        (event: DockerPushProgress) => {
          if (onProgress) {
            onProgress(event);
          }

          if (event.status && event.progress) {
            const progressStr = `${event.status}: ${event.progress}`;
            if (progressStr !== lastProgressStr) {
              logger.info(progressStr);
              lastProgressStr = progressStr;
            }
          } else if (event.status && event.status !== lastProgressStr) {
            logger.info(event.status);
            lastProgressStr = event.status;
          }

          if (event.error) {
            logger.error(`Push error: ${event.error}`);
            reject(new Error(event.error));
          }
        },
      );
    });
  });
};

export const uploadContainer = async ({
  apiToken: apiToken_,
  localImageTag,
  commitSha,
  waitForBase = false,
  callbacks,
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

  await pushImage(
    docker,
    imageReference,
    authconfig,
    callbacks?.onPushProgress,
  );
  logger.info(`Successfully pushed image ${imageReference}`);

  logger.info("Completing container upload and triggering test run...");

  const completeResult = await completeContainerUpload({
    client,
    uploadId,
    commitSha,
    mustHaveBase: waitForBase,
  });

  let testRun = completeResult.testRun ?? null;
  let baseNotFound = completeResult.baseNotFound;
  let message = completeResult.message;
  let lastTimeElapsed = 0;

  if (waitForBase && baseNotFound && !testRun) {
    const startTime = Date.now();
    logger.info("Waiting for base test run to be created...");

    while (!testRun && baseNotFound) {
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed > POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS) {
        logger.warn(
          `Timed out after ${
            POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS / 1000
          } seconds waiting for base test run`,
        );
        break;
      }
      if (lastTimeElapsed == 0 || timeElapsed - lastTimeElapsed >= 30_000) {
        logger.info(
          `Waiting for base test run to be created. Time elapsed: ${Math.round(timeElapsed / 1000)}s`,
        );
        lastTimeElapsed = timeElapsed;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, POLL_FOR_BASE_TEST_RUN_INTERVAL_MS),
      );

      const retryResult = await completeContainerUpload({
        client,
        uploadId,
        commitSha,
        mustHaveBase: waitForBase,
      });
      testRun = retryResult.testRun ?? null;
      baseNotFound = retryResult.baseNotFound;
      message = retryResult.message;
    }

    if (baseNotFound && !testRun) {
      logger.info("Base test run not found, proceeding without it.");
      const finalResult = await completeContainerUpload({
        client,
        uploadId,
        commitSha,
        mustHaveBase: false,
      });
      testRun = finalResult.testRun ?? null;
      message = finalResult.message;
    }
  }

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
