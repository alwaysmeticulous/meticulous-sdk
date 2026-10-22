import type { AtifStep } from "../../types/atif.types";
import { asNonEmptyString, asString } from "../../utils/json-guards";
import type { OpenCodeExportMessage } from "../opencode-export.types";
import { assistantMessageToSteps } from "./assistant-message-to-steps";
import type { SubagentLink } from "./collect-assistant-parts";
import type { TokenSemantics } from "./opencode-tokens";
import { userMessageToStep } from "./user-message-to-step";

export interface BuiltSteps {
  steps: AtifStep[];
  subagentLinks: SubagentLink[];
  /** Messages with neither the user nor the assistant role. */
  unconvertedMessageCount: number;
}

/** Converts one session's messages, in order, into ATIF steps. */
export const buildOpenCodeSteps = (
  messages: OpenCodeExportMessage[],
  tokenSemantics: TokenSemantics,
): BuiltSteps => {
  const compactionRequests = findCompactionRequests(messages);
  const built: BuiltSteps = {
    steps: [],
    subagentLinks: [],
    unconvertedMessageCount: 0,
  };
  for (const message of messages) {
    switch (asString(message.info["role"])) {
      case "user": {
        const step = userMessageToStep(message);
        if (step) {
          built.steps.push(step);
        }
        break;
      }
      case "assistant": {
        const parentId = asNonEmptyString(message.info["parentID"]);
        const isSummary = message.info["summary"] === true;
        const { steps, subagentLinks } = assistantMessageToSteps(
          message,
          isSummary
            ? {
                auto: parentId
                  ? (compactionRequests.get(parentId) ?? false)
                  : false,
              }
            : null,
          tokenSemantics,
        );
        built.steps.push(...steps);
        built.subagentLinks.push(...subagentLinks);
        break;
      }
      default:
        built.unconvertedMessageCount++;
    }
  }
  built.steps.forEach((step, index) => {
    step.step_id = index + 1;
  });
  return built;
};

/** User message id to whether its compaction was automatic. */
const findCompactionRequests = (
  messages: OpenCodeExportMessage[],
): Map<string, boolean> => {
  const requests = new Map<string, boolean>();
  for (const { info, parts } of messages) {
    const id = asNonEmptyString(info["id"]);
    const compaction = parts.find((part) => part["type"] === "compaction");
    if (id && compaction) {
      requests.set(id, compaction["auto"] === true);
    }
  }
  return requests;
};
