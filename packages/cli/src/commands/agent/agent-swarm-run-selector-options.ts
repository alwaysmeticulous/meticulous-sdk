import {
  type AgentSwarmRunProcessingResponse,
  type AgentSwarmRunTarget,
  isAgentSwarmRunProcessingResponse,
} from "@alwaysmeticulous/client";
import { getCommitSha, logNotice } from "@alwaysmeticulous/common";
import { printJson } from "../../command-utils/print-json";
import { CliUserError } from "../../utils/cli-user-error";
import { pollWhileProcessing } from "../../utils/poll-while-processing";
import { logResolvedCommitSha } from "../../utils/resolve-test-run-from-commit";
import { assertSingleRunSelector, prNumberOption } from "./pr-number-option";

/** How `agent-swarm-run` and `agent-swarm-run-case` name their Agent swarm run. */
export interface SwarmRunSelectorOptions {
  apiToken?: string | null | undefined;
  swarmRunId: string | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  prNumber: number | undefined;
  project?: string | undefined;
  dontWaitForSwarmRunToComplete: boolean;
  json: boolean;
}

export const swarmRunSelectorBuilder = {
  apiToken: { string: true, description: "Meticulous API token." },
  swarmRunId: {
    string: true,
    conflicts: ["testRunId", "commitSha", "prNumber", "project"],
    description:
      "The Agent swarm run ID, e.g. from `agent agent-swarm-runs`. When omitted, the latest execution run is looked up from --testRunId, --prNumber or --commitSha, or from the current git HEAD when none is given.",
  },
  testRunId: {
    string: true,
    description:
      "A test run ID, used as an alternative to --swarmRunId: looks up the latest execution run for the test run's commit.",
  },
  commitSha: {
    string: true,
    description:
      "A commit SHA, used as an alternative to --swarmRunId: looks up the latest execution run for the commit. Defaults to the current git HEAD when none of --swarmRunId, --testRunId, --prNumber and --commitSha is given.",
  },
  prNumber: {
    ...prNumberOption(["swarmRunId"]),
    description:
      "A pull/merge request number, used as an alternative to --swarmRunId: looks up the latest execution run for the pull request's head commit, exactly as --commitSha would for that commit.",
  },
  project: {
    string: true,
    description:
      "The project to look up the commit or pull request in (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s). Cannot be combined with --swarmRunId or --testRunId, which already determine the project.",
    conflicts: ["testRunId", "swarmRunId"],
  },
} as const;

/** Declared last, after each command's own options. */
export const dontWaitForSwarmRunToCompleteOption = {
  dontWaitForSwarmRunToComplete: {
    boolean: true,
    default: false,
    description:
      'By default, if the Agent swarm run is still in progress the command blocks until it finishes, for at most 10 minutes. Pass this to instead exit immediately; an unfinished run is then reported on stderr, and with --json as the backend\'s { status: "processing", message } body.',
  },
} as const;

/**
 * The run to request: `--swarmRunId`, else the test run, pull request or
 * commit to take the latest execution run of, defaulting to the checkout's
 * HEAD when none is given.
 */
export const resolveSwarmRunSelector = async ({
  swarmRunId,
  testRunId,
  commitSha,
  prNumber,
  project,
}: SwarmRunSelectorOptions): Promise<AgentSwarmRunTarget> => {
  assertSingleRunSelector({ testRunId, prNumber, commitSha });
  if (swarmRunId != null) {
    if (testRunId != null || prNumber != null || commitSha != null) {
      throw new CliUserError(
        "Pass only one of --swarmRunId, --testRunId, --prNumber and --commitSha.",
      );
    }
    return { swarmRunId };
  }
  if (testRunId != null) {
    return { testRunId };
  }
  if (prNumber != null) {
    return { prNumber, project };
  }
  const resolvedCommitSha = await getCommitSha(commitSha);
  if (!resolvedCommitSha) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or --swarmRunId, --testRunId or --prNumber, or run inside a git repository.",
    );
  }
  await logResolvedCommitSha(commitSha, resolvedCommitSha);
  return { commitSha: resolvedCommitSha, project };
};

/**
 * Requests a run's result, by default blocking while the run hasn't finished.
 * With `dontWait` the request still goes out once, so an unfinished run's
 * `--json` output is the backend's own processing body, as the MCP tool
 * returns it. Returns `null` once an unfinished run has been reported.
 */
export const requestFinishedSwarmRunResult = async <R extends object>(
  request: () => Promise<R | AgentSwarmRunProcessingResponse>,
  { dontWait, json }: { dontWait: boolean; json: boolean },
): Promise<R | null> => {
  const response = dontWait
    ? await request()
    : await pollWhileProcessing(request, {
        isProcessing: isAgentSwarmRunProcessingResponse,
        waitingMessage: (first) => first.message,
        timeoutMessage: (last) =>
          `The Agent swarm run did not finish within 10 minutes. ${last.message} Re-run this command later to check again.`,
      });
  if (isAgentSwarmRunProcessingResponse(response)) {
    logNotice(response.message);
    if (json) {
      printJson(response);
    }
    return null;
  }
  return response;
};
