import { executeWithRetry, initLogger } from "@alwaysmeticulous/common";
import Docker from "dockerode";

type DockerPushProgressEvent = {
  status?: string;
  id?: string;
  progress?: string;
  error?: string;
  errorDetail?: {
    message?: string;
  };
  aux?: {
    Digest?: string;
  };
};

class IncompleteDockerPushError extends Error {}

const DOCKER_PUSH_RETRY_OPTIONS = {
  maxRetries: 2,
  retryDelay: 1_000,
  maxRetryDelay: 2_000,
  shouldRetry: (error: unknown): boolean =>
    error instanceof IncompleteDockerPushError,
};

export const getDockerClient = (): Docker => {
  return new Docker();
};

export const verifyDockerConnection = async (docker: Docker): Promise<void> => {
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

export const getImageInfo = async (
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

export const tagImage = async (
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
    throw new Error(`Failed to tag Docker image: ${error}`, { cause: error });
  }
};

/**
 * Gets a tarball of a path from inside a local image as a stream, by
 * creating a container from the image without starting it, reading the path
 * out via the Docker archive API (equivalent of `docker cp <container>:<path> -`),
 * and removing the container once the stream has been fully consumed.
 *
 * The trailing `/.` mirrors `docker cp`'s own convention: it makes the
 * returned tar contain the *contents* of `pathInImage` at its root (e.g.
 * `index.html`, `assets/...`) rather than wrapping them in a `<basename>/`
 * directory, so the tar can be re-used as-is as the deployable bundle without
 * any repacking.
 */
export const getTarStreamFromImage = async (
  docker: Docker,
  imageTag: string,
  pathInImage: string,
): Promise<NodeJS.ReadableStream> => {
  const logger = initLogger();
  const container = await docker.createContainer({ Image: imageTag });

  const cleanup = () =>
    container.remove({ force: true }).catch(() => {
      // Best-effort cleanup; the container was never started so a leaked
      // one is inert, just wastes a small amount of disk.
    });

  try {
    const normalizedPath = pathInImage.endsWith("/.")
      ? pathInImage
      : `${pathInImage.replace(/\/+$/, "")}/.`;
    logger.info(`Reading ${pathInImage} from image ${imageTag}...`);
    const archiveStream = await container.getArchive({
      path: normalizedPath,
    });
    archiveStream.once("end", () => void cleanup());
    archiveStream.once("error", () => void cleanup());
    return archiveStream;
  } catch (error) {
    await cleanup();
    throw new Error(
      `Failed to read '${pathInImage}' from image '${imageTag}'. Ensure the path exists in the image.`,
      { cause: error },
    );
  }
};

export const pushImage = async (
  docker: Docker,
  imageReference: string,
  authconfig: Docker.AuthConfig,
): Promise<void> => {
  const logger = initLogger();

  logger.info(`Starting Docker push for ${imageReference}`);
  await executeWithRetry(
    () => pushImageOnce(docker, imageReference, authconfig),
    {
      ...DOCKER_PUSH_RETRY_OPTIONS,
      logger,
    },
  );
};

const pushImageOnce = async (
  docker: Docker,
  imageReference: string,
  authconfig: Docker.AuthConfig,
): Promise<void> => {
  const logger = initLogger();

  return new Promise((resolve, reject) => {
    const image = docker.getImage(imageReference);

    image.push({ authconfig }, (err, stream) => {
      if (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to push image ${imageReference}`);
        logger.error(`Error: ${message}`);
        reject(new Error(`Failed to push Docker image: ${message}`));
        return;
      }

      if (!stream) {
        reject(new Error("No stream returned from Docker push"));
        return;
      }

      docker.modem.followProgress(
        stream,
        (err, output: DockerPushProgressEvent[]) => {
          if (err) {
            logger.error(
              `Docker push stream failed for ${imageReference}: ${err.message}`,
            );
            reject(
              new IncompleteDockerPushError(
                `Docker push stream failed: ${err.message}`,
                { cause: err },
              ),
            );
            return;
          }

          const daemonError = getDockerPushError(output);
          if (daemonError) {
            logger.error(
              `Docker daemon reported an incomplete push for ${imageReference}: ${daemonError}`,
            );
            reject(
              new IncompleteDockerPushError(
                `Docker daemon reported an incomplete push: ${daemonError}`,
              ),
            );
            return;
          }

          const digest = getPushedDigest(output);
          if (!digest) {
            const lastStatus = getLastDockerPushStatus(output);
            logger.error(
              `Docker push stream ended without publishing a manifest for ${imageReference}. Last status: ${lastStatus}`,
            );
            reject(
              new IncompleteDockerPushError(
                `Docker push ended before the registry confirmed a manifest digest. Last status: ${lastStatus}`,
              ),
            );
            return;
          }

          logger.info(
            `Successfully pushed image ${imageReference} with digest ${digest}`,
          );
          resolve();
        },
        (event: DockerPushProgressEvent) => {
          logger.debug(formatDockerPushProgress(event));
        },
      );
    });
  });
};

const getDockerPushError = (
  output: DockerPushProgressEvent[],
): string | null => {
  for (const event of output) {
    const message = event.errorDetail?.message ?? event.error;
    if (message) {
      return message;
    }
  }
  return null;
};

const getPushedDigest = (output: DockerPushProgressEvent[]): string | null => {
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const event = output[index];
    if (!event) {
      continue;
    }
    if (event.aux?.Digest) {
      return event.aux.Digest;
    }
    const digest = event.status?.match(/\bdigest:\s*(sha256:[a-f0-9]{64})\b/i);
    if (digest?.[1]) {
      return digest[1];
    }
  }
  return null;
};

const getLastDockerPushStatus = (output: DockerPushProgressEvent[]): string => {
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const status = output[index]?.status;
    if (status) {
      return status;
    }
  }
  return "no progress events received";
};

const formatDockerPushProgress = (event: DockerPushProgressEvent): string => {
  const layer = event.id ? ` [${event.id}]` : "";
  const progress = event.progress ? ` ${event.progress}` : "";
  const status =
    event.errorDetail?.message ??
    event.error ??
    event.status ??
    "unknown Docker push event";
  return `Docker push${layer}: ${status}${progress}`;
};
