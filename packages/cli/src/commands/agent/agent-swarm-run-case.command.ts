import {
  type AgentSwarmCaseResponse,
  createClientWithOAuth,
  getAgentSwarmRunCase,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  dontWaitForSwarmRunToCompleteOption,
  requestFinishedSwarmRunResult,
  resolveSwarmRunSelector,
  type SwarmRunSelectorOptions,
  swarmRunSelectorBuilder,
} from "./agent-swarm-run-selector-options";
import { formatSwarmRunCase } from "./agent-swarm-run-case.utils";

interface SwarmRunCaseOptions extends SwarmRunSelectorOptions {
  caseIndex: number;
  fixPrompt: boolean;
}

const swarmRunCaseHandler = async (
  options: SwarmRunCaseOptions,
): Promise<void> => {
  const { caseIndex, fixPrompt, json } = options;
  if (fixPrompt && json) {
    throw new CliUserError(
      "--fixPrompt cannot be combined with --json: --fixPrompt prints only the bare prompt text, and --json output already includes it as fixPrompt.",
    );
  }
  const target = await resolveSwarmRunSelector(options);
  const client = await createClientWithOAuth({
    apiToken: options.apiToken,
    enableOAuthLogin: true,
  });
  const result = await requestFinishedSwarmRunResult(
    () => getAgentSwarmRunCase(client, target, caseIndex),
    { dontWait: options.dontWaitForSwarmRunToComplete, json },
  );
  if (result == null) {
    return;
  }
  if (fixPrompt) {
    if (result.fixPrompt == null) {
      throw new CliUserError(
        `Case ${caseIndex} has no fix prompt: only failures upheld by the failure checker, readable with source-code access, have one.`,
      );
    }
    console.log(result.fixPrompt);
    return;
  }
  if (json) {
    printJson(result);
  } else {
    printCase(result);
  }
};

export const agentSwarmRunCaseCommand: CommandModule<
  unknown,
  SwarmRunCaseOptions
> = {
  command: "agent-swarm-run-case",
  describe:
    "Get the full details for a given Agent swarm case. Outputs one key:\\tvalue line per field, keyed by its --json path: swarmRunId, caseIndex, title, status, blockedBy, outcomeSummary, diagnosis, rationale (which changed code it targets), steps[i] in order (outcome, description, and the reason for a failed or blocked step), comparisons[i] (base-vs-head, verdict regression or intended-change), runEvidence (the backend requests that failed, hung or were very slow and the page errors during the run: a failure that depends on them may be environmental), check: the failure checker's source-grounded verdict, confidence, headline, reason and linkedToChange (no means the failure stands but the pull request did not cause it, e.g. a pre-existing bug or an unhealthy backend), and sessionIds. check quotes the project's source, so it is withheld from callers who may not read the code. fixPrompt is a ready-made prompt for fixing an upheld failure: verify its cited code against the current branch before applying it, as the suggested fix is a starting point, not a verified patch. If the run has not finished, blocks until it has, for at most 10 minutes.",
  builder: {
    ...swarmRunSelectorBuilder,
    caseIndex: {
      number: true,
      demandOption: true,
      description: "The case's caseIndex, from `agent agent-swarm-run`.",
      coerce: (value: number) => {
        if (!Number.isInteger(value) || value < 0) {
          throw new Error("--caseIndex must be a non-negative integer.");
        }
        return value;
      },
    },
    fixPrompt: {
      boolean: true,
      default: false,
      description:
        "Output only the fix prompt for an upheld failure. Cannot be combined with --json, whose output already includes it as fixPrompt.",
    },
    ...dontWaitForSwarmRunToCompleteOption,
  },
  handler: wrapHandler(swarmRunCaseHandler),
};

const printCase = (testCase: AgentSwarmCaseResponse): void => {
  for (const line of formatSwarmRunCase(testCase)) {
    console.log(line);
  }
  if (testCase.checkWithheld != null) {
    logNotice(
      "Failure check withheld: it quotes source code, which this caller may not read.",
    );
  }
  if (testCase.fixPrompt != null) {
    logNotice("A fix prompt is available: pass --fixPrompt to print it.");
  }
};
