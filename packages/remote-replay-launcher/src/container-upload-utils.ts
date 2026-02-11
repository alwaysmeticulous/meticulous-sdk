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
import ora from "ora";
import { Readable } from "stream";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface UploadContainerOptions {
  apiToken: string | null | undefined;
  localImageTag: string;
  commitSha: string;
  waitForBase?: boolean;
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
      "Failed to connect to Docker daemon. Please ensure Docker is running and try again."
    );
    if (error instanceof Error) {
      logger.error(`Docker error: ${error.message}`);
    }
    throw new Error(
      "Docker daemon is not running or unreachable. Please start Docker and try again."
    );
  }
};

const getImageInfo = async (
  docker: Docker,
  imageTag: string
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
  targetImage: string
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
  spinner: ora.Ora | null,
  onProgress?: (progress: any) => void
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

      let lastProgress = "";
      
      docker.modem.followProgress(
        stream as Readable,
        (err, output) => {
          if (err) {
            if (spinner) {
              spinner.fail(`Failed to push image ${imageReference}`);
            }
            logger.error(`Error during image push: ${err.message}`);
            reject(err);
            return;
          }
          if (spinner) {
            spinner.succeed(`Successfully pushed image ${imageReference}`);
          }
          resolve();
        },
        (event) => {
          if (onProgress) {
            onProgress(event);
          }
          
          if (event.status && event.progress) {
            const progressStr = `${event.status}: ${event.progress}`;
            if (progressStr !== lastProgress) {
              if (spinner) {
                spinner.text = progressStr;
              } else {
                logger.info(progressStr);
              }
              lastProgress = progressStr;
            }
          } else if (event.status && event.status !== lastProgress) {
            if (spinner) {
              spinner.text = event.status;
            } else {
              logger.info(event.status);
            }
            lastProgress = event.status;
          }
          
          if (event.error) {
            if (spinner) {
              spinner.fail(`Push error: ${event.error}`);
            }
            logger.error(`Push error: ${event.error}`);
            reject(new Error(event.error));
          }
        }
      );
    });
  });
};

export const uploadContainer = async ({
  apiToken: apiToken_,
  localImageTag,
  commitSha,
  waitForBase = false,
}: UploadContainerOptions): Promise<UploadContainerResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter"
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });

  const docker = getDockerClient();

  let spinner = ora("Verifying Docker connection").start();
  try {
    await verifyDockerConnection(docker);
    spinner.succeed("Docker connection verified");
  } catch (error) {
    spinner.fail("Failed to connect to Docker");
    throw error;
  }

  spinner = ora(`Verifying local Docker image: ${localImageTag}`).start();
  const imageInfo = await getImageInfo(docker, localImageTag);
  if (!imageInfo) {
    spinner.fail(`Docker image '${localImageTag}' not found`);
    throw new Error(
      `Docker image '${localImageTag}' not found locally. Please build the image first.`
    );
  }
  spinner.succeed(`Found Docker image: ${localImageTag}`);

  spinner = ora("Getting registry credentials").start();
  const registryAuth = await getRegistryAuth({ client });
  spinner.succeed("Registry credentials obtained");
  
  const { uploadId, imageReference, registryUrl, robotAccountName, robotAccountSecret } = registryAuth;
  
  logger.info(`Registry: ${registryUrl}`);
  logger.info(`Upload ID: ${uploadId}`);
  logger.info(`Image reference: ${imageReference}`);

  spinner = ora(`Tagging image for registry`).start();
  try {
    await tagImage(docker, localImageTag, imageReference);
    spinner.succeed(`Tagged image as ${imageReference}`);
  } catch (error) {
    spinner.fail("Failed to tag image");
    throw error;
  }

  spinner = ora(`Pushing image to registry`).start();
  const authconfig: Docker.AuthConfig = {
    username: robotAccountName,
    password: robotAccountSecret,
    serveraddress: registryUrl,
  };

  await pushImage(docker, imageReference, authconfig, spinner);

  spinner = ora("Completing container upload and triggering test run").start();
  
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
    spinner.text = "Waiting for base test run to be created";
    const startTime = Date.now();

    while (!testRun && baseNotFound) {
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed > POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS) {
        spinner.warn(
          `Timed out after ${
            POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS / 1000
          } seconds waiting for base test run`
        );
        break;
      }
      if (lastTimeElapsed == 0 || timeElapsed - lastTimeElapsed >= 30_000) {
        spinner.text = `Waiting for base test run. Time elapsed: ${Math.round(timeElapsed / 1000)}s`;
        lastTimeElapsed = timeElapsed;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, POLL_FOR_BASE_TEST_RUN_INTERVAL_MS)
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
      spinner.text = "Base test run not found, proceeding without it";
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
    spinner.succeed("Container upload complete and test run triggered");
  } else {
    spinner.warn("Container upload complete but test run not created");
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
