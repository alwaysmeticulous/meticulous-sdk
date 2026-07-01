import {
  createClientWithOAuth,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import { triggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { awaitTestRunCompletion } from "../../utils/resolve-test-run-from-commit";
import {
  resolveComparisonOptions,
  resolveHeadCommitShaForLookup,
} from "./build-git-options";

interface Options {
  apiToken?: string | undefined;
  deploymentId?: string | undefined;
  commitSha?: string | undefined;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;
  sessionIds?: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
  dryRun?: boolean;
}

const handler = async ({
  apiToken,
  deploymentId,
  commitSha: commitSha_,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
  repoDirectory,
  sessionIds: sessionIds_,
  dontWaitForTestRunToComplete,
  json,
  dryRun,
}: Options): Promise<void> => {
  if (deploymentId && commitSha_) {
    throw new CliUserError(
      "--deploymentId and --commitSha are mutually exclusive. Pass --deploymentId for a build from 'agent upload-build', " +
        "or --commitSha to find an existing deployment already uploaded for that commit.",
    );
  }
  // With neither given, fall back to the local repo's HEAD commit, on the
  // assumption a deployment was already uploaded for it elsewhere (e.g. by CI).
  let commitSha = commitSha_;
  if (!deploymentId && !commitSha) {
    commitSha = await resolveHeadCommitShaForLookup({ repoDirectory });
  }
  // Session IDs never contain commas (they are `<ISO timestamp>_<nanoid>` with
  // optional `_p`/`_sl`/`_mut` suffixes), so a comma split is unambiguous.
  const sessionIds = sessionIds_
    ?.split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  // Reject an explicitly-provided-but-empty list (e.g. --sessionIds "" or
  // --sessionIds ",,,") rather than silently falling back to the golden set:
  // the caller asked to pin sessions but named none, which is a mistake.
  if (sessionIds_ != null && (!sessionIds || sessionIds.length === 0)) {
    throw new CliUserError(
      "--sessionIds was provided but contains no session IDs. Omit --sessionIds to use the project's auto-selected sessions.",
    );
  }
  // Reject duplicates rather than silently de-duplicating: a repeated session ID
  // is a caller mistake, and quietly dropping it would mask it.
  if (sessionIds && sessionIds.length !== new Set(sessionIds).size) {
    const duplicates = [
      ...new Set(
        sessionIds.filter((id, index) => sessionIds.indexOf(id) !== index),
      ),
    ];
    throw new CliUserError(
      `--sessionIds contains duplicate session ID(s): ${duplicates.join(", ")}`,
    );
  }
  const { baseSha, gitDiffOutput, head, headIsEphemeral } =
    await resolveComparisonOptions({
      baseSha: baseSha_,
      gitDiffOutput: gitDiffOutput_,
      repoDirectory,
    });
  // A git diff must be uploaded to a specific deployment before the trigger
  // call, so --commitSha (resolved to a deployment server-side, at trigger
  // time) can't be combined with one — whether passed explicitly via
  // --gitDiffOutput or inferred from --repoDirectory / the local repo.
  if (gitDiffOutput && !deploymentId) {
    throw new CliUserError(
      "A git diff requires an explicit --deploymentId (from 'agent upload-build'); it cannot be combined with --commitSha. " +
        "Pass --baseSha instead of --repoDirectory (or without any repo-inference flags) to avoid inferring a diff.",
    );
  }

  // A test run is only useful with a base to compare against, and the backend
  // refuses to create a baseless run, so require a base up front.
  if (!baseSha) {
    throw new CliUserError(
      "A base is required: pass --baseSha, or --repoDirectory to infer it from the merge-base with the origin default branch.",
    );
  }

  // When the head is the base itself and there's no diff (e.g. running on the
  // default branch with no new commits), there is nothing to test — report it
  // clearly instead of letting the backend reject with a 422. `head` is only
  // known here when inferred from a local repo (--repoDirectory); `commitSha`
  // is an explicit alternative source of the head commit that lets us catch
  // this early too, without a network round trip to resolve the deployment
  // first (gitDiffOutput is already guaranteed absent when commitSha is used,
  // per the check above).
  const effectiveHead = head ?? commitSha;
  if (effectiveHead && baseSha === effectiveHead && !gitDiffOutput) {
    logNotice(
      "Base SHA equals head SHA and there are no changes to test — nothing to do.",
    );
    // Keep stdout machine-readable: emit the empty result so `--json` callers
    // that JSON.parse(stdout) don't crash on an empty short-circuit.
    if (json) {
      console.log(JSON.stringify({ testRunId: null, status: null }, null, 2));
    }
    return;
  }

  const deploymentDescriptor = deploymentId
    ? `deployment ${deploymentId}`
    : `the deployment for commit ${commitSha}`;

  if (dryRun) {
    logNotice(
      `Dry run: would trigger a test run for ${deploymentDescriptor} (base: ${baseSha})` +
        (sessionIds && sessionIds.length > 0
          ? ` for ${sessionIds.length} explicitly-specified session(s)`
          : ""),
    );
    if (json) {
      console.log(JSON.stringify({ testRunId: null, status: null }, null, 2));
    }
    return;
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const projectIdentifier = resolveProjectIdentifier(apiToken_);

  logProgress(`Triggering test run for ${deploymentDescriptor}...`);

  let testRunId: string | null;
  try {
    const { testRun, headCommitSha } = await triggerTestRun({
      apiToken: apiToken_,
      ...(deploymentId ? { deploymentId } : { commitSha }),
      baseSha,
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      ...(sessionIds && sessionIds.length > 0 ? { sessionIds } : {}),
      ...projectIdentifier,
    });
    testRunId = testRun?.id ?? null;

    // The diff was computed against `head`, but the run executes the
    // deployment's commit. If they differ (e.g. the working tree changed
    // between 'upload-build' and 'trigger-test-run'), the diff may not match
    // the build that actually ran. Skipped for dirty trees: `head` is then an
    // ephemeral stash SHA that differs between invocations for identical
    // content, so the comparison would be a false positive.
    if (!headIsEphemeral && head && headCommitSha && head !== headCommitSha) {
      logNotice(
        `Warning: git diff was computed against ${head}, but the deployment runs ${headCommitSha}. ` +
          `The diff may not match the build under test — re-run 'agent upload-build' for the current tree if this is unexpected.`,
      );
    }
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    }
    throw error;
  }

  if (testRunId) {
    logProgress(`testRunId: ${testRunId}`);
  }

  let status: string | null = null;
  if (!dontWaitForTestRunToComplete && testRunId) {
    // Use an OAuth-refreshing client: the wait can poll for minutes, longer than
    // a short-lived OAuth access token lives, so a baked-in token would expire
    // mid-poll (surfacing as a 404 on the test-run lookup). awaitTestRunCompletion
    // prints the single "Waiting for test run X to complete..." line.
    const client = await createClientWithOAuth({
      apiToken,
      enableOAuthLogin: true,
    });
    status = await awaitTestRunCompletion(client, testRunId);
    logProgress(
      `Status: ${status} (${status === "Failure" ? "has" : "no"} diffs)`,
    );
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
      string: true,
      description:
        "The deployment to test, as returned by 'agent upload-build'. Mutually exclusive with --commitSha. " +
        "When both are omitted, the local repo's HEAD commit is used to look up an existing deployment (requires a clean working tree).",
    },
    commitSha: {
      string: true,
      description:
        "Alternative to --deploymentId: finds the most recent deployment already uploaded for this commit in the project " +
        "(e.g. by an earlier CI run). Useful for re-running against a commit that has already gone through Meticulous, " +
        "e.g. to test the coverage impact of --sessionIds. Cannot be combined with a git diff (--gitDiffOutput, or inferred via --repoDirectory). " +
        "When both this and --deploymentId are omitted, defaults to the local repo's HEAD commit (requires a clean working tree).",
    },
    baseSha: {
      string: true,
      description:
        "The base commit SHA to compare against. Cannot be combined with --repoDirectory. " +
        "If omitted (and no --repoDirectory), it is inferred from the local repo (the current directory).",
    },
    gitDiffOutput: {
      string: true,
      description:
        "Raw git diff output between the base and the deployment's commit. Requires --baseSha. Cannot be combined with --repoDirectory.",
    },
    repoDirectory: {
      string: true,
      description:
        "Path to a git repository. Infers --baseSha (merge-base with the origin default branch) and --gitDiffOutput (base..head). Cannot be combined with --baseSha or --gitDiffOutput. Defaults to the current directory when no comparison inputs are given.",
    },
    sessionIds: {
      string: true,
      description:
        "Comma-separated list of session IDs to replay (for both base and head), instead of the project's auto-selected sessions. " +
        "When omitted, the project's auto-selected ('golden set') sessions are used.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "Return as soon as the run is triggered, instead of the default of blocking until it finishes. " +
        "The base test run is set up by the backend in parallel with the head, so there is no separate base-wait step.",
    },
    json: {
      boolean: true,
      default: false,
      description: "Output the result ({ testRunId, status }) as JSON.",
    },
    dryRun: {
      boolean: true,
      default: false,
      description:
        "Print what would be triggered, without triggering a test run.",
    },
  },
  handler: wrapHandler(handler),
};
