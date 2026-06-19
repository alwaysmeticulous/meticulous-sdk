import {
  createClient,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import {
  uploadAssetsAndTriggerTestRun,
  uploadContainer,
} from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../../utils/resolve-project-identifier";
import { awaitTestRunCompletion } from "../../../utils/resolve-test-run-from-commit";
import {
  hasGitContextForTestRunWait,
  resolveGitOptions,
} from "./resolve-git-options";
import { TriggerTestRunOptions, TriggerTestRunResult } from "./trigger-test-run.types";
import { detectUploadMode, parseRewrites } from "./trigger-test-run.utils";

/**
 * Shared "right way" to trigger a custom test run: resolves git context, uploads
 * either static assets or a Docker container (auto-detected from the inputs),
 * triggers the test run, and optionally blocks until it completes.
 *
 * This is the single implementation used by both `meticulous agent
 * trigger-test-run` and the deprecated `ci upload-assets` / `ci upload-container`
 * commands.
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

  const { commitSha, baseSha, gitDiffOutput, withUncommittedChanges } =
    await resolveGitOptions({
      commitSha: commitSha_,
      baseSha: baseSha_,
      gitDiffOutput: gitDiffOutput_,
      repoDirectory,
    });

  if (baseSha && baseSha === commitSha && !gitDiffOutput) {
    logger.info(
      "Base SHA equals head SHA and no git diff output provided — nothing to test. " +
        "If you have uncommitted changes, provide --gitDiffOutput or use --repoDirectory.",
    );
    return { testRunId: null, status: null };
  }

  if (dryRun) {
    logDryRun({ mode, options, commitSha, baseSha });
    return { testRunId: null, status: null };
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const projectIdentifier = resolveProjectIdentifier(apiToken_);

  const testRunId =
    mode === "container"
      ? await runContainerUpload({
          options,
          apiToken: apiToken_,
          commitSha,
          baseSha,
          gitDiffOutput,
          withUncommittedChanges,
          projectIdentifier,
        })
      : await runAssetUpload({
          options,
          apiToken: apiToken_,
          commitSha,
          baseSha,
          gitDiffOutput,
          withUncommittedChanges,
          projectIdentifier,
        });

  if (!waitForTestRunToComplete || !testRunId) {
    return { testRunId, status: null };
  }

  const client = createClient({ apiToken: apiToken_ });
  const status = await awaitTestRunCompletion(client, testRunId);
  return { testRunId, status };
};

interface UploadParams {
  options: TriggerTestRunOptions;
  apiToken: string;
  commitSha: string;
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
  withUncommittedChanges: boolean;
  projectIdentifier: { projectId?: string };
}

const runAssetUpload = async ({
  options,
  apiToken,
  commitSha,
  baseSha,
  gitDiffOutput,
  withUncommittedChanges,
  projectIdentifier,
}: UploadParams): Promise<string | null> => {
  const logger = initLogger();
  const { appDirectory, appZip, rewrites, waitForBase, waitForTestRunToComplete } =
    options;

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
      ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
      appDirectory,
      appZip,
      rewrites: parseRewrites(rewrites),
      waitForBase: waitForBase || waitForTestRunToComplete,
      ...projectIdentifier,
    });
    return result.testRun?.id ?? null;
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
  withUncommittedChanges,
  projectIdentifier,
}: UploadParams): Promise<string | null> => {
  const logger = initLogger();
  const {
    localImageTag,
    containerPort,
    containerEnv,
    containerHealthCheckEndpoint,
    waitForBase,
    waitForTestRunToComplete,
  } = options;

  // detectUploadMode guarantees localImageTag is set in container mode.
  if (!localImageTag) {
    throw new CliUserError("Missing --localImageTag for container upload.");
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
      ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
      waitForBase: waitForBase || waitForTestRunToComplete,
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
      ...projectIdentifier,
    });

    if (!result.testRun) {
      throw new Error(
        `${result.message ?? "Container upload complete but test run not created"}`,
      );
    }
    return result.testRun.id;
  } catch (error) {
    throw translateUploadError(error);
  }
};

const translateUploadError = (error: unknown): Error =>
  isOutOfDateClientError(error)
    ? new OutOfDateCLIError()
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
}): void => {
  const logger = initLogger();
  const baseSuffix = baseSha ? ` (base: ${baseSha})` : "";
  if (mode === "container") {
    logger.info(
      `Dry run: would push container image "${options.localImageTag}" and trigger a test run for commit ${commitSha}${baseSuffix}`,
    );
  } else {
    logger.info(
      `Dry run: would upload ${options.appDirectory ?? options.appZip} and trigger a test run for commit ${commitSha}${baseSuffix}`,
    );
  }
};
