import {
  createClientWithOAuth,
  getTestRunForCommit,
} from "@alwaysmeticulous/client";
import { getCommitSha, logNotice, logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
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
  project?: string | undefined;
}

const handler = async ({
  apiToken,
  commitSha,
  dontWaitForTestRunToComplete,
  json,
  project,
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

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  // `project` is a one-off override (resolved flexibly server-side); when
  // omitted, project-scoped tokens use their own project and OAuth tokens
  // fall back to the caller's stored default (`meticulous auth set-project`).
  const result = await getTestRunForCommit(client, resolvedCommitSha, {
    project,
  });

  if (result.testRunId == null) {
    if (json) {
      printJson(result);
    }
    // Guidance on stderr regardless of --json (which only changes stdout).
    logNotice(
      await appendProjectSelectionHint(
        `No test run found for commit ${resolvedCommitSha}.`,
        client,
        project,
      ),
    );
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
    printJson({ ...result, status });
  } else {
    logProgress(`testRunId: ${result.testRunId}`);
    console.log(result.testRunId);
  }
  if (status != null && isTestRunInProgress(status)) {
    // Reached only with --dontWaitForTestRunToComplete on an unfinished run.
    // Guidance on stderr regardless of --json (which only changes stdout).
    logNotice(
      `Test run ${result.testRunId} is not complete (status: ${status}).`,
    );
  }
};

export const testRunForCommitCommand: CommandModule<unknown, Options> = {
  command: "test-run-for-commit",
  describe:
    "Look up the latest test run for a given commit (defaults to the current git HEAD). Outputs the testRunId, or nothing (with --json, a null testRunId) when there is no usable run yet — in which case the reply also names the project that was searched, since the failure may be due to a wrong project being selected as default (see auth get-project / auth set-project).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    commitSha: {
      string: true,
      description:
        "The commit to look up. Defaults to the current git HEAD when omitted.",
    },
    project: {
      string: true,
      description:
        "The project to look up the commit for (id, 'org/proj', or simply 'proj'). One-off override, when omitted uses the user-configured default project.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "Return the latest run immediately instead of the default of blocking until it finishes; an unfinished run is then reported as not complete.",
    },
  },
  handler: wrapHandler(handler),
};
