import {
  createClientWithOAuth,
  getTestRunForCommit,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { getCommitSha, logNotice, logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import {
  awaitTestRunCompletion,
  isTestRunInProgress,
  logResolvedCommitSha,
} from "../../utils/resolve-test-run-from-commit";

interface Options {
  apiToken?: string | null | undefined;
  commitSha: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
}

const handler = async ({
  apiToken,
  commitSha,
  dontWaitForTestRunToComplete,
  json,
}: Options): Promise<void> => {
  // Default to the current checkout's HEAD so the command can be run with no
  // arguments to auto-infer the test run for the working tree.
  const resolvedCommitSha = await getCommitSha(commitSha);
  if (!resolvedCommitSha) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or run inside a git repository.",
    );
  }
  // The lookup is by commit, so warn when the local tree is dirty (the run is
  // resolved for HEAD, not the uncommitted changes), matching trigger-test-run /
  // test-run-diffs.
  await logResolvedCommitSha(commitSha, resolvedCommitSha);

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  // Project-scoped tokens pin the project (resolves to `{}`); OAuth tokens use
  // the project chosen via `meticulous auth set-project`.
  const { projectId } = resolveProjectIdentifier(apiToken_);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const result = await getTestRunForCommit(client, resolvedCommitSha, {
    projectId,
  });

  if (result.testRunId == null) {
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    logNotice(`No test run found for commit ${resolvedCommitSha}`);
    return;
  }

  // Block until the run finishes (default) so the reported run is a finished
  // verdict; with --dontWaitForTestRunToComplete, return the current (possibly
  // in-progress) run immediately. throwOnFailure is false: this command just
  // resolves an id, so a failed run's id is still reported.
  let status = result.status;
  if (
    !dontWaitForTestRunToComplete &&
    status != null &&
    isTestRunInProgress(status)
  ) {
    status = await awaitTestRunCompletion(client, result.testRunId, {
      throwOnFailure: false,
    });
  }

  if (json) {
    console.log(JSON.stringify({ ...result, status }, null, 2));
    return;
  }
  logProgress(`testRunId: ${result.testRunId}`);
  console.log(result.testRunId);
  if (status != null && isTestRunInProgress(status)) {
    // Reached only with --dontWaitForTestRunToComplete on an unfinished run.
    logNotice(
      `Test run ${result.testRunId} is not complete (status: ${status}).`,
    );
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
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "Return the latest run immediately instead of the default of blocking until it finishes; an unfinished run is then reported as not complete.",
    },
    json: {
      boolean: true,
      description: "Output the raw response as JSON",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
