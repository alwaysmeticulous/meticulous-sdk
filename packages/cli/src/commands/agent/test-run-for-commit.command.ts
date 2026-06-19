import {
  createClient,
  getTestRunForCommit,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import {
  awaitTestRunCompletion,
  isTestRunComplete,
  isTestRunInProgress,
} from "../../utils/resolve-test-run-from-commit";

interface Options {
  apiToken?: string | null | undefined;
  commitSha: string | undefined;
  waitForTestRunToComplete: boolean;
  json: boolean;
}

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const handler = async ({
  apiToken,
  commitSha,
  waitForTestRunToComplete,
  json,
}: Options): Promise<void> => {
  initLogger();

  // Default to the current checkout's HEAD so the command can be run with no
  // arguments to auto-infer the test run for the working tree.
  const resolvedCommitSha = await getCommitSha(commitSha);
  if (!resolvedCommitSha) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or run inside a git repository.",
    );
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  // Project-scoped tokens pin the project (resolves to `{}`); OAuth tokens use
  // the project chosen via `meticulous auth set-project`.
  const { projectId } = resolveProjectIdentifier(apiToken_);
  const client = createClient({ apiToken: apiToken_ });

  let result = await getTestRunForCommit(client, resolvedCommitSha, {
    projectId,
  });

  if (
    result.testRunId != null &&
    result.status != null &&
    waitForTestRunToComplete &&
    isTestRunInProgress(result.status)
  ) {
    const status = await awaitTestRunCompletion(client, result.testRunId);
    result = { ...result, status };
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.testRunId == null) {
    log(`No test run found for commit ${resolvedCommitSha}`);
    return;
  }
  console.log(result.testRunId);
  if (result.status != null && !isTestRunComplete(result.status)) {
    // Covers in-progress and Partial (more sessions can still be added on
    // demand), as well as runs that finished unsuccessfully.
    const hint = waitForTestRunToComplete
      ? ""
      : " Pass --waitForTestRunToComplete to block until it finishes.";
    log(`Test run is not complete (status: ${result.status}).${hint}`);
  }
};

export const testRunForCommitCommand: CommandModule<unknown, Options> = {
  command: "test-run-for-commit",
  describe:
    "Look up the latest test run for a commit (defaults to the current git HEAD)",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    commitSha: {
      string: true,
      description:
        "Commit SHA to look up. Defaults to the current git HEAD when omitted.",
    },
    waitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "If the matched test run is still in progress, block until it finishes before returning.",
    },
    json: {
      boolean: true,
      description: "Output the raw response as JSON",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
