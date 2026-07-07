import {
  createClientWithOAuth,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import { triggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { printJson } from "../../command-utils/print-json";
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
  sessionIds?: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
  dryRun?: boolean;
}

/**
 * Whether the "nothing to test" short-circuit should fire: base equals head
 * with no diff to attach. Requires `commitSha` (--commitSha mode, explicit or
 * inferred): in --deploymentId mode `effectiveHead` is only a local proxy for
 * the deployment's actual commit, so an empty local diff doesn't prove
 * there's nothing to test there (the backend may already have a diff
 * uploaded separately for that deployment and base). Also skipped for a
 * pinned --sessionIds re-run, which deliberately proceeds head-only.
 */
export const shouldSkipAsNothingToTest = ({
  commitSha,
  effectiveHead,
  baseSha,
  gitDiffOutput,
  hasPinnedSessionIds,
}: {
  commitSha: string | undefined;
  effectiveHead: string | undefined;
  baseSha: string;
  gitDiffOutput: string | undefined;
  hasPinnedSessionIds: boolean;
}): boolean =>
  Boolean(commitSha) &&
  Boolean(effectiveHead) &&
  baseSha === effectiveHead &&
  !gitDiffOutput &&
  !hasPinnedSessionIds;

/**
 * Whether to warn that the diff computed pre-trigger may not match what the
 * deployment actually executed. Skipped for ephemeral heads (a `git stash
 * create` SHA differs between invocations for identical content, so the
 * comparison would be a false positive) or when either commit is unknown.
 */
export const shouldWarnOfHeadDrift = ({
  headIsEphemeral,
  head,
  headCommitSha,
}: {
  headIsEphemeral: boolean;
  head: string | undefined;
  headCommitSha: string | null;
}): boolean =>
  !headIsEphemeral &&
  Boolean(head) &&
  Boolean(headCommitSha) &&
  head !== headCommitSha;

const handler = async ({
  apiToken,
  deploymentId,
  commitSha: commitSha_,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
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
    commitSha = await resolveHeadCommitShaForLookup();
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
  // Every custom trigger gets a git diff (used by Relevant Session Execution),
  // computed against `commitSha` when we have one (--commitSha mode, explicit
  // or inferred above) or freshly resolved from local HEAD otherwise
  // (--deploymentId mode).
  const { baseSha, gitDiffOutput, head, headIsEphemeral } =
    await resolveComparisonOptions({
      baseSha: baseSha_,
      gitDiffOutput: gitDiffOutput_,
      commitSha,
    });
  // A test run is only useful with a base to compare against, and the backend
  // refuses to create a baseless run, so require a base up front — even
  // though it may end up unused for comparison below (a same-SHA re-run with
  // pinned --sessionIds runs head-only with no base).
  if (!baseSha) {
    throw new CliUserError(
      "A base is required: pass --baseSha, or run from a local git checkout so it can be inferred from the merge-base with the origin default branch.",
    );
  }

  // When the head is the base itself and there's no diff (e.g. running on the
  // default branch with no new commits), there is nothing to test — report it
  // clearly instead of letting the backend reject with a 422 (see
  // shouldSkipAsNothingToTest for the exemptions).
  const effectiveHead = head ?? commitSha;
  const hasPinnedSessionIds = sessionIds != null && sessionIds.length > 0;
  if (
    shouldSkipAsNothingToTest({
      commitSha,
      effectiveHead,
      baseSha,
      gitDiffOutput,
      hasPinnedSessionIds,
    })
  ) {
    logNotice(
      "Base SHA equals head SHA and there are no changes to test — nothing to do.",
    );
    // Keep stdout machine-readable: emit the empty result so `--json` callers
    // that JSON.parse(stdout) don't crash on an empty short-circuit.
    if (json) {
      printJson({ testRunId: null, status: null });
    }
    return;
  }

  const deploymentDescriptor = deploymentId
    ? `deployment ${deploymentId}`
    : `the deployment for commit ${commitSha}`;

  if (dryRun) {
    logNotice(
      `Dry run: would trigger a test run for ${deploymentDescriptor} (base: ${baseSha})` +
        (hasPinnedSessionIds
          ? ` for ${sessionIds.length} explicitly-specified session(s)`
          : ""),
    );
    if (json) {
      printJson({ testRunId: null, status: null });
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
      ...(hasPinnedSessionIds ? { sessionIds } : {}),
      ...projectIdentifier,
    });
    testRunId = testRun?.id ?? null;

    // The diff was computed against `head`, but the run executes the
    // deployment's commit. If they differ (e.g. the working tree changed
    // between 'upload-build' and 'trigger-test-run'), the diff may not match
    // the build that actually ran (see shouldWarnOfHeadDrift for the
    // ephemeral-head exemption).
    if (shouldWarnOfHeadDrift({ headIsEphemeral, head, headCommitSha })) {
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
    printJson({ testRunId, status });
    return;
  }
  if (testRunId) {
    console.log(testRunId);
  }
};

export const triggerTestRunCommand: CommandModule<unknown, Options> = {
  command: "trigger-test-run",
  describe:
    "Trigger a test run against a deployment created by 'agent upload-build'. Outputs the testRunId (or JSON with --json).",
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
        "e.g. to test the coverage impact of --sessionIds. A git diff against --baseSha is computed for this commit " +
        "(git history must have it locally) unless you pass --gitDiffOutput yourself. " +
        "When both this and --deploymentId are omitted, defaults to the local repo's HEAD commit (requires a clean working tree).",
    },
    baseSha: {
      string: true,
      description:
        "The base commit SHA to compare against. If omitted, it's inferred from the local repo (the current directory) as the merge-base " +
        "with the origin default branch. Every trigger gets a git diff against this base (used by Relevant Session Execution) — " +
        "against --commitSha when using it, or the local repo's head commit with --deploymentId — unless you pass --gitDiffOutput yourself.",
    },
    gitDiffOutput: {
      string: true,
      description:
        "Raw git diff output between the base and the head commit (the deployment's commit, or --commitSha). Requires --baseSha.",
    },
    sessionIds: {
      string: true,
      description:
        "Comma-separated list of session IDs to replay, instead of the project's auto-selected sessions. Replayed on the base too, unless the run ends up head-only (see below). " +
        "When omitted, the project's auto-selected ('golden set') sessions are used. " +
        "When non-empty and --baseSha equals the head commit with no diff, the run proceeds head-only (no base run or comparison) instead of failing with 'nothing to do'.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "Return as soon as the run is triggered, instead of the default of blocking until it finishes. " +
        "The base test run is set up by the backend in parallel with the head, so there is no separate base-wait step.",
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
