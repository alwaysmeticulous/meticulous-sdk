import {
  createClient,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { triggerRun } from "@alwaysmeticulous/remote-replay-launcher";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../../command-utils/common-options";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../../utils/resolve-project-identifier";
import { awaitTestRunCompletion } from "../../../utils/resolve-test-run-from-commit";
import { resolveComparisonOptions } from "../build-git-options";

interface Options {
  apiToken?: string | undefined;
  deploymentId: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;
  waitForTestRunToComplete: boolean;
  json: boolean;
  dryRun?: boolean;
}

const handler = async ({
  apiToken,
  deploymentId,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
  repoDirectory,
  waitForTestRunToComplete,
  json,
  dryRun,
}: Options): Promise<void> => {
  const logger = initLogger();

  const { baseSha, gitDiffOutput } = await resolveComparisonOptions({
    baseSha: baseSha_,
    gitDiffOutput: gitDiffOutput_,
    repoDirectory,
  });

  // A test run is only useful with a base to compare against, and the backend
  // refuses to create a baseless run, so require a base up front.
  if (!baseSha) {
    throw new CliUserError(
      "A base is required: pass --baseSha, or --repoDirectory to infer it from the merge-base with the origin default branch.",
    );
  }

  if (dryRun) {
    logger.info(
      `Dry run: would trigger a test run for deployment ${deploymentId}${baseSha ? ` (base: ${baseSha})` : ""}`,
    );
    return;
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const projectIdentifier = resolveProjectIdentifier(apiToken_);

  let testRunId: string | null;
  try {
    const { testRun } = await triggerRun({
      apiToken: apiToken_,
      deploymentId,
      baseSha,
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      ...projectIdentifier,
    });
    testRunId = testRun?.id ?? null;
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    }
    throw error;
  }

  let status: string | null = null;
  if (waitForTestRunToComplete && testRunId) {
    const client = createClient({ apiToken: apiToken_ });
    status = await awaitTestRunCompletion(client, testRunId);
  }

  if (json) {
    console.log(JSON.stringify({ testRunId, status }, null, 2));
    return;
  }
  if (testRunId) {
    console.log(testRunId);
  }
};

export const triggerTestRunCommand: CommandModule<unknown, Options> = {
  command: "trigger-test-run",
  describe:
    "Trigger a test run against a deployment created by 'agent upload-build'",
  builder: {
    apiToken: OPTIONS.apiToken,
    deploymentId: {
      demandOption: true,
      string: true,
      description:
        "The deployment to test, as returned by 'agent upload-build'.",
    },
    baseSha: {
      string: true,
      description:
        "The base commit SHA to compare against. Cannot be combined with --repoDirectory.",
    },
    gitDiffOutput: {
      string: true,
      description:
        "Raw git diff output between the base and the deployment's commit. Requires --baseSha. Cannot be combined with --repoDirectory.",
    },
    repoDirectory: {
      string: true,
      description:
        "Path to a git repository. Infers --baseSha (merge-base with the origin default branch) and --gitDiffOutput (base..head). Cannot be combined with --baseSha or --gitDiffOutput.",
    },
    waitForTestRunToComplete: {
      boolean: true,
      default: true,
      description:
        "Block until the triggered test run finishes (default). Pass --no-waitForTestRunToComplete to return as soon as the run is triggered. " +
        "The base test run is set up by the backend in parallel with the head, so there is no separate base-wait step.",
    },
    json: {
      boolean: true,
      default: false,
      description: "Output the result ({ testRunId, status }) as JSON.",
    },
  },
  handler: wrapHandler(handler),
};
