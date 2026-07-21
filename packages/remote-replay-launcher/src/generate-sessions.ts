import { readFile } from "fs/promises";
import type {
  ContainerEnvVariable,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import {
  completeAgenticSessionGeneration,
  createClient,
  getApiToken,
  getRegistryAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import type Docker from "dockerode";
import { uploadAgenticInstructionsToS3 } from "./asset-upload-utils";
import {
  getDockerClient,
  getImageInfo,
  pushImage,
  tagImage,
  verifyDockerConnection,
} from "./docker-utils";

export interface GenerateSessionsOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  localImageTag: string;
  commitSha: string;
  /** Path to a markdown file with instructions for the agent (login details, accounts, etc). */
  instructionsFile?: string | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
}

export interface GenerateSessionsResult {
  uploadId: string;
  workflowRunId?: string | null;
  message?: string;
}

/**
 * Uploads the customer's app image (to Harbor) plus an optional markdown
 * instructions file (to S3), then kicks off a dedicated agentic session
 * generation workflow that spins up the app, drives a browser with the
 * Meticulous recorder injected, and produces new sessions to test on the PR.
 */
export const generateSessions = async ({
  apiToken: apiToken_,
  localImageTag,
  commitSha,
  instructionsFile,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  projectId,
}: GenerateSessionsOptions): Promise<GenerateSessionsResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });
  const projectIdentifier = projectId ? { projectId } : {};

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

  logger.info(`Upload ID: ${uploadId}`);
  logger.info(`Image reference: ${imageReference}`);

  await tagImage(docker, localImageTag, imageReference);

  logger.info(`Pushing image to registry: ${imageReference}`);
  const authconfig: Docker.AuthConfig = {
    username: robotAccountName,
    password: robotAccountSecret,
    serveraddress: registryUrl,
  };
  await pushImage(docker, imageReference, authconfig);
  logger.info(`Successfully pushed image ${imageReference}`);

  let instructionsId: string | undefined;
  if (instructionsFile) {
    const instructions = await readFile(instructionsFile, "utf-8");
    if (instructions.trim().length > 0) {
      instructionsId = await uploadAgenticInstructionsToS3({
        client,
        instructions,
        ...projectIdentifier,
      });
    }
  }

  logger.info("Launching agentic session generation workflow...");
  const result = await completeAgenticSessionGeneration({
    client,
    uploadId,
    commitSha,
    ...(instructionsId ? { instructionsId } : {}),
    containerPort,
    containerEnv,
    containerHealthCheckEndpoint,
    ...projectIdentifier,
  });

  Sentry.captureMessage("Agentic session generation triggered", {
    level: "debug",
    extra: {
      uploadId,
      commitSha,
      workflowRunId: result.workflowRunId,
      imageReference,
    },
  });

  logger.info(
    `Agentic session generation launched. Upload ID: ${uploadId}${
      result.workflowRunId ? `, workflow run: ${result.workflowRunId}` : ""
    }`,
  );

  return {
    uploadId,
    workflowRunId: result.workflowRunId ?? null,
    ...(result.message ? { message: result.message } : {}),
  };
};
