import { initLogger } from "@alwaysmeticulous/common";
import Docker from "dockerode";

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
        logger.info(`Successfully pushed image ${imageReference}`);
        resolve();
      });
    });
  });
};
