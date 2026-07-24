import {
  createClientWithOAuth,
  submitAgentFeedback,
  type AgentFeedbackOutcome,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";

const OUTCOMES = ["helped", "neutral", "hindered"] as const;

interface Options {
  apiToken?: string | null | undefined;
  message: string;
  outcome?: string | undefined;
  testRunId?: string | undefined;
  skill?: string | undefined;
  agentName?: string | undefined;
  agentModel?: string | undefined;
  json: boolean;
  project?: string | undefined;
}

const handler = async ({
  apiToken,
  message,
  outcome,
  testRunId,
  skill,
  agentName,
  agentModel,
  json,
  project,
}: Options): Promise<void> => {
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const result = await submitAgentFeedback({
    client,
    message,
    outcome: outcome as AgentFeedbackOutcome | undefined,
    testRunId,
    skill,
    agentName,
    agentModel,
    project,
  });

  if (json) {
    printJson(result);
  } else {
    logProgress(`feedbackId: ${result.feedbackId}`);
    console.log(result.feedbackId);
  }
  logNotice("Feedback submitted. Thank you!");
};

export const submitFeedbackCommand: CommandModule<unknown, Options> = {
  command: "submit-feedback",
  describe:
    "Submit free-form feedback about Meticulous to the Meticulous team — e.g. whether it helped catch or debug a problem, what was confusing, or what information would have made your task easier. Outputs the feedbackId.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    message: {
      string: true,
      demandOption: true,
      description:
        "The feedback itself: one or two sentences on whether Meticulous helped, what was missing or confusing, and what would have made the task easier.",
    },
    outcome: {
      string: true,
      choices: OUTCOMES,
      description:
        "Whether Meticulous helped, hindered, or made no difference to your task.",
    },
    testRunId: {
      string: true,
      description: "The test run the feedback relates to, if any.",
    },
    skill: {
      string: true,
      description:
        "The agentic skill or workflow you were following, e.g. 'meticulous-review'.",
    },
    agentName: {
      string: true,
      description:
        "The agent product submitting the feedback, e.g. 'claude-code'.",
    },
    agentModel: {
      string: true,
      description: "The underlying model, e.g. 'claude-sonnet-5'.",
    },
    project: {
      string: true,
      description:
        "The project the feedback relates to (id, 'org/proj', or simply 'proj'). One-off override, when omitted uses the user-configured default project.",
    },
  },
  handler: wrapHandler(handler),
};
