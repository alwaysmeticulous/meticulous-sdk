import {
  createClientWithOAuth,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  carryCompletedUpload,
  uploadAssetsAndTriggerTestRun,
  uploadContainer,
  withCompletedUpload,
} from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { parseRewrites } from "../../command-utils/parse-rewrites";
import { CliUserError } from "../../utils/cli-user-error";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { awaitTestRunCompletion } from "../../utils/resolve-test-run-from-commit";
import { detectUploadMode } from "../../command-utils/detect-upload-mode";
import {
  hasGitContextForTestRunWait,
  resolveGitOptions,
} from "./resolve-git-options";
import { ciUploadFields } from "./ci-command-result";
import type {
  TriggerTestRunOptions,
  TriggerTestRunResult,
} from "./trigger-test-run.types";

/**
 * Fused "upload + trigger in one call" core for the `ci upload-assets` /
 * `ci upload-container` commands — the standard CI-check path (upload your
 * build, trigger the run for this PR/push). Resolves git context, uploads
 * static assets or a Docker container (auto-detected), triggers the run, and
 * optionally blocks until it completes.
 *
 * The commands are NOT deprecated; only their custom-trigger options
 * (`--baseSha` / `--gitDiffOutput` / `--repoDirectory`) are, superseded by the
 * split `agent upload-build` + `agent trigger-test-run` commands. Those agent
 * commands do not use this core — they upload and trigger as two separate steps
 * via `uploadBuild` / `triggerTestRun` in `remote-replay-launcher`.
 */
export const triggerTestRun = async (
  options: TriggerTestRunOptions,
): Promise<TriggerTestRunResult> => {
  const logger = initLogger();

  const mode = detectUploadMode(options);

  const {
    apiToken,
    commitSha: commitSha_,
    baseSha: baseSha_,
    gitDiffOutput: gitDiffOutput_,
    repoDirectory,
    waitForTestRunToComplete,
    dryRun,
  } = options;

  if (
    waitForTestRunToComplete &&
    !hasGitContextForTestRunWait(repoDirectory, baseSha_, gitDiffOutput_)
  ) {
    throw new CliUserError(
      "--waitForTestRunToComplete is only for runs from a local branch checkout: pass --repoDirectory " +
        "(path to your clone on the branch under test) or both --baseSha and --gitDiffOutput from that branch. " +
        "If you only pass --commitSha you are not on a branch checkout — omit this flag.",
    );
  }

  const { commitSha, baseSha, gitDiffOutput } = await resolveGitOptions({
    commitSha: commitSha_,
    baseSha: baseSha_,
    gitDiffOutput: gitDiffOutput_,
    repoDirectory,
  });

  if (baseSha && baseSha === commitSha && !gitDiffOutput) {
    const message =
      "Base SHA equals head SHA and no git diff output provided — nothing to test. " +
      "If you have uncommitted changes, provide --gitDiffOutput or use --repoDirectory.";
    logger.info(message);
    return {
      outcome: "skipped",
      reason: "nothing_to_test",
      message,
      testRunId: null,
      status: null,
    };
  }

  if (dryRun) {
    const message = logDryRun({ mode, options, commitSha, baseSha });
    return {
      outcome: "skipped",
      reason: "dry_run",
      message,
      testRunId: null,
      status: null,
    };
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const projectIdentifier = await resolveProjectIdentifier(apiToken_);

  const uploadResult =
    mode === "container"
      ? await runContainerUpload({
          options,
          apiToken: apiToken_,
          commitSha,
          baseSha,
          gitDiffOutput,
          projectIdentifier,
        })
      : await runAssetUpload({
          options,
          apiToken: apiToken_,
          commitSha,
          baseSha,
          gitDiffOutput,
          projectIdentifier,
        });

  if ("skipReason" in uploadResult) {
    return {
      outcome: "skipped",
      reason: uploadResult.skipReason,
      message: uploadResult.message,
      testRunId: null,
      status: null,
      ...uploadResult.fields,
    };
  }

  const { testRunId, fields } = uploadResult;
  if (!waitForTestRunToComplete) {
    return { outcome: "success", testRunId, status: null, ...fields };
  }

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  let status: Awaited<ReturnType<typeof awaitTestRunCompletion>>;
  try {
    status = await awaitTestRunCompletion(client, testRunId);
  } catch (error) {
    throw withTestRunIds(error, testRunId, fields);
  }
  return { outcome: "success", testRunId, status, ...fields };
};

/** Keep the run's ids on an error thrown while waiting for it to finish. */
const withTestRunIds = (
  error: unknown,
  testRunId: string,
  fields: ReturnType<typeof ciUploadFields>,
): unknown => {
  if (error instanceof CliUserError) {
    return new CliUserError(error.message, error.exitCode, error.severity, {
      outcome: error.outcome,
      ...(error.reason ? { reason: error.reason } : {}),
      ...fields,
      testRunId,
    });
  }
  return fields.sourceDeploymentId
    ? withCompletedUpload(error, {
        sourceDeploymentId: fields.sourceDeploymentId,
      })
    : error;
};

interface UploadParams {
  options: TriggerTestRunOptions;
  apiToken: string | null;
  commitSha: string;
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
  projectIdentifier: { projectId?: string };
}

type UploadResult = {
  fields: ReturnType<typeof ciUploadFields>;
} & (
  | { testRunId: string }
  | {
      testRunId: null;
      skipReason: "comments_disabled_for_author";
      message: string;
    }
);

const runAssetUpload = async ({
  options,
  apiToken,
  commitSha,
  baseSha,
  gitDiffOutput,
  projectIdentifier,
}: UploadParams): Promise<UploadResult> => {
  const logger = initLogger();
  const {
    appDirectory,
    appZip,
    rewrites,
    waitForBase,
    waitForTestRunToComplete,
  } = options;

  logger.info(`Uploading build artifacts for commit ${commitSha}`);
  Sentry.captureMessage("Received upload assets request", {
    level: "debug",
    extra: { commitSha },
  });

  try {
    const result = await uploadAssetsAndTriggerTestRun({
      apiToken,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      appDirectory,
      appZip,
      rewrites: parseRewrites(rewrites),
      waitForBase: waitForBase || waitForTestRunToComplete,
      ...projectIdentifier,
    });
    const fields = ciUploadFields({
      sourceDeploymentId: result.sourceDeploymentId,
      testRunUrl: result.testRun?.url,
    });
    if (result.skipReason) {
      return {
        testRunId: null,
        skipReason: result.skipReason,
        message:
          result.message ??
          "Test run skipped because CI comments and checks are disabled for this pull request author.",
        fields,
      };
    }
    if (!result.testRun) {
      const error = new Error("Test run was not created");
      throw result.sourceDeploymentId
        ? withCompletedUpload(error, {
            sourceDeploymentId: result.sourceDeploymentId,
          })
        : error;
    }
    return { testRunId: result.testRun.id, fields };
  } catch (error) {
    throw translateUploadError(error);
  }
};

const runContainerUpload = async ({
  options,
  apiToken,
  commitSha,
  baseSha,
  gitDiffOutput,
  projectIdentifier,
}: UploadParams): Promise<UploadResult> => {
  const logger = initLogger();
  const {
    localImageTag,
    containerPort,
    containerEnv,
    containerHealthCheckEndpoint,
    companionAssetsFolder,
    companionAssetsZip,
    companionAssetsPathInImage,
    companionAssetsRegex,
    waitForBase,
    waitForTestRunToComplete,
  } = options;

  // detectUploadMode guarantees localImageTag is set in container mode.
  if (!localImageTag) {
    throw new CliUserError("Missing --localImageTag for container upload.");
  }

  const companionAssetsSourceCount = [
    companionAssetsFolder,
    companionAssetsZip,
    companionAssetsPathInImage,
  ].filter(Boolean).length;
  if (companionAssetsSourceCount > 1) {
    throw new CliUserError(
      "You cannot provide more than one of --companionAssetsFolder, --companionAssetsZip, and --companionAssetsPathInImage. Please provide only one.",
    );
  }
  const hasCompanionAssets = companionAssetsSourceCount === 1;
  if (hasCompanionAssets !== !!companionAssetsRegex) {
    throw new CliUserError(
      "You must provide both --companionAssetsRegex and exactly one of --companionAssetsFolder/--companionAssetsZip/--companionAssetsPathInImage, or neither.",
    );
  }

  logger.info(
    `Uploading Docker container ${localImageTag} for commit ${commitSha}`,
  );
  Sentry.captureMessage("Received upload container request", {
    level: "debug",
    extra: { commitSha, localImageTag },
  });

  try {
    const result = await uploadContainer({
      apiToken,
      localImageTag,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      waitForBase: waitForBase || waitForTestRunToComplete,
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
      ...(hasCompanionAssets && companionAssetsRegex
        ? {
            companionAssets: {
              folder: companionAssetsFolder,
              zip: companionAssetsZip,
              pathInImage: companionAssetsPathInImage,
              regex: companionAssetsRegex,
            },
          }
        : {}),
      ...projectIdentifier,
    });

    const fields = ciUploadFields({
      sourceDeploymentId: result.uploadId,
      testRunUrl: result.testRun?.url,
    });
    if (!result.testRun) {
      if (result.commentsDisabledForAuthor) {
        logger.info(
          result.message ??
            "Test run skipped because CI comments and checks are disabled for this pull request author.",
        );
        return {
          testRunId: null,
          skipReason: "comments_disabled_for_author",
          message:
            result.message ??
            "Test run skipped because CI comments and checks are disabled for this pull request author.",
          fields,
        };
      }
      throw withCompletedUpload(
        new Error(
          `${result.message ?? "Container upload complete but test run not created"}`,
        ),
        { sourceDeploymentId: result.uploadId },
      );
    }
    return { testRunId: result.testRun.id, fields };
  } catch (error) {
    throw translateUploadError(error);
  }
};

const translateUploadError = (error: unknown): unknown =>
  isOutOfDateClientError(error)
    ? carryCompletedUpload(error, new OutOfDateCLIError())
    : error instanceof Error
      ? error
      : new Error(String(error));

const logDryRun = ({
  mode,
  options,
  commitSha,
  baseSha,
}: {
  mode: "assets" | "container";
  options: TriggerTestRunOptions;
  commitSha: string;
  baseSha: string | undefined;
}): string => {
  const logger = initLogger();
  const baseSuffix = baseSha ? ` (base: ${baseSha})` : "";
  if (mode === "container") {
    const message = `Dry run: would push container image "${options.localImageTag}" and trigger a test run for commit ${commitSha}${baseSuffix}`;
    logger.info(message);
    return message;
  } else {
    const message = `Dry run: would upload ${options.appDirectory ?? options.appZip} and trigger a test run for commit ${commitSha}${baseSuffix}`;
    logger.info(message);
    return message;
  }
};
