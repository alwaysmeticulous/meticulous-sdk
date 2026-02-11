import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import {
  uploadContainer,
  DockerPushProgress,
} from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { SingleBar, Presets } from "cli-progress";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  localImageTag: string;
  waitForBase: boolean;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  localImageTag,
  waitForBase,
}) => {
  const logger = initLogger();
  const commitSha = await getCommitSha(commitSha_);

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha"
    );
    process.exit(1);
  }

  logger.info(
    `Uploading Docker container ${localImageTag} for commit ${commitSha}`
  );
  Sentry.captureMessage("Received upload container request", {
    level: "debug",
    extra: {
      commitSha: commitSha,
      localImageTag: localImageTag,
    },
  });

  const progressBar = new SingleBar(
    {
      format: "Pushing | {bar} | {percentage}% | {layer}",
      hideCursor: true,
    },
    Presets.shades_classic
  );
  const layerProgress = new Map<string, { current: number; total: number }>();
  let progressBarStarted = false;

  try {
    const result = await uploadContainer({
      apiToken,
      localImageTag,
      commitSha,
      waitForBase,
      callbacks: {
        onPushProgress: (progress: DockerPushProgress) => {
          if (!progressBarStarted) {
            progressBar.start(100, 0, { layer: "Starting..." });
            progressBarStarted = true;
          }

          if (
            progress.id &&
            progress.progressDetail?.current &&
            progress.progressDetail?.total
          ) {
            layerProgress.set(progress.id, {
              current: progress.progressDetail.current,
              total: progress.progressDetail.total,
            });
          }

          let totalCurrent = 0;
          let totalSize = 0;
          for (const layer of layerProgress.values()) {
            totalCurrent += layer.current;
            totalSize += layer.total;
          }

          if (totalSize > 0) {
            const percentage = Math.floor((totalCurrent / totalSize) * 100);
            progressBar.update(percentage, {
              layer: progress.status || "Pushing...",
            });
          } else if (progress.status) {
            progressBar.update(0, { layer: progress.status });
          }
        },
      },
    });

    if (progressBarStarted) {
      progressBar.update(100, { layer: "Complete" });
      progressBar.stop();
    }

    if (!result.testRun) {
      logger.warn("Container upload complete but test run not created");
    }
  } catch (error) {
    if (progressBarStarted) {
      progressBar.stop();
    }

    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
};

export const uploadContainerAndExecuteTestRunInCloudCommand = buildCommand(
  "upload-container-and-execute-test-run-in-cloud"
)
  .details({
    describe:
      "Upload a Docker container to Meticulous and trigger a test run against it",
  })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    localImageTag: {
      demandOption: true,
      string: true,
      description:
        "The local Docker image tag to upload (e.g., 'myapp:latest' or image SHA)",
    },
    waitForBase: {
      demandOption: false,
      boolean: true,
      default: true,
      description:
        "If true, the launcher will try to wait for a base test run to be created before triggering a test run. If that is not found, it will trigger a test run without waiting for a base test run.",
    },
  } as const)
  .handler(handler);
