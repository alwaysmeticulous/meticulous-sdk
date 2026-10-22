import type { AtifStep } from "../types/atif.types";
import { assertNever } from "../utils/assert-never";
import { asNonEmptyString } from "../utils/json-guards";
import {
  buildOrphanToolResultStep,
  buildPiAgentStep,
  buildPiToolResult,
} from "./build-pi-agent-step";
import {
  buildBashExecutionStep,
  buildBranchSummaryStep,
  buildCompactionSummaryStep,
  buildCustomMessageStep,
  buildPromptStep,
} from "./build-pi-user-step";
import { parseContent, parsePiMessage } from "./parse-pi-message";
import type { PiEntry } from "./pi-entry.types";
import type { PiMessage, PiToolResultMessage } from "./pi-message.types";

/** Entry types that carry no conversation content of their own. */
const NON_CONVERSATION_ENTRY_TYPES = new Set([
  "model_change",
  "thinking_level_change",
  "session_info",
  "label",
  "custom",
  "usage",
  "context_edit",
]);

interface BuildContext {
  steps: AtifStep[];
  stepsByToolCallId: Map<string, AtifStep>;
  unconvertedTypes: Set<string>;
}

interface BuiltSteps {
  steps: AtifStep[];
  /** Entry types and message roles the converter doesn't know. */
  unconvertedTypes: string[];
}

/**
 * Converts the active branch's entries into ATIF steps, attaching tool
 * results to the step that issued the call.
 */
export const buildPiSteps = (path: PiEntry[]): BuiltSteps => {
  const context: BuildContext = {
    steps: [],
    stepsByToolCallId: new Map(),
    unconvertedTypes: new Set(),
  };
  for (const entry of path) {
    addEntry(context, entry);
  }
  context.steps.forEach((step, index) => {
    step.step_id = index + 1;
  });
  return {
    steps: context.steps,
    unconvertedTypes: [...context.unconvertedTypes],
  };
};

const addEntry = (context: BuildContext, entry: PiEntry) => {
  const { raw } = entry;
  switch (entry.type) {
    case "message": {
      const message = parsePiMessage(raw["message"]);
      if (message) {
        addMessage(context, entry, message);
      }
      return;
    }
    case "compaction":
      context.steps.push(
        buildCompactionSummaryStep(entry, raw["summary"], raw["tokensBefore"]),
      );
      return;
    case "branch_summary":
      context.steps.push(
        buildBranchSummaryStep(entry, raw["summary"], raw["fromId"]),
      );
      return;
    case "custom_message":
      context.steps.push(
        buildCustomMessageStep(
          entry,
          parseContent(raw["content"]),
          asNonEmptyString(raw["customType"]),
          raw["display"] !== false,
        ),
      );
      return;
    default:
      if (!NON_CONVERSATION_ENTRY_TYPES.has(entry.type)) {
        context.unconvertedTypes.add(entry.type);
      }
  }
};

const addMessage = (
  context: BuildContext,
  entry: PiEntry,
  message: PiMessage,
) => {
  const { steps } = context;
  switch (message.role) {
    case "user": {
      const step = buildPromptStep(entry, message);
      if (step) {
        steps.push(step);
      }
      return;
    }
    case "assistant": {
      const step = buildPiAgentStep(entry, message);
      steps.push(step);
      for (const call of message.toolCalls) {
        context.stepsByToolCallId.set(call.id, step);
      }
      return;
    }
    case "toolResult":
      attachToolResult(context, entry, message);
      return;
    case "bashExecution":
      steps.push(buildBashExecutionStep(entry, message));
      return;
    case "custom":
      steps.push(
        buildCustomMessageStep(
          entry,
          message,
          message.customType,
          message.display,
        ),
      );
      return;
    case "compactionSummary":
      steps.push(
        buildCompactionSummaryStep(
          entry,
          message.summary,
          message.tokensBefore,
        ),
      );
      return;
    case "branchSummary":
      steps.push(
        buildBranchSummaryStep(entry, message.summary, message.fromId),
      );
      return;
    case "system":
      return;
    case "other":
      context.unconvertedTypes.add(`message:${message.originalRole}`);
      return;
    default:
      assertNever(message);
  }
};

const attachToolResult = (
  context: BuildContext,
  entry: PiEntry,
  message: PiToolResultMessage,
) => {
  const { toolCallId } = message;
  const step = toolCallId
    ? context.stepsByToolCallId.get(toolCallId)
    : undefined;
  if (!step || !toolCallId) {
    context.steps.push(buildOrphanToolResultStep(entry, message));
    return;
  }
  step.observation ??= { results: [] };
  step.observation.results.push({
    source_call_id: toolCallId,
    ...buildPiToolResult(message),
  });
};
