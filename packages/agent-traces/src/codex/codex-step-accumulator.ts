import type { AtifStep, AtifToolCall } from "../types/atif.types";
import type {
  CodexEntry,
  CodexEntryPosition,
  CodexTokenUsage,
} from "./codex-entry.types";
import { usageToMetrics } from "./usage-to-metrics";

type ModelOutputEntry = Extract<
  CodexEntry,
  { kind: "assistant" | "reasoning" | "tool-call" }
>;

/**
 * Collects the items of one model response (Codex writes each output item
 * as its own line, followed by the response's usage) into one agent step.
 */
export interface CodexStepAccumulator {
  step: AtifStep;
  texts: string[];
  reasoning: string[];
  encryptedReasoning: boolean;
  toolCalls: AtifToolCall[];
  messageIds: string[];
  phases: string[];
  /** A tool result arrived, so further output belongs to the next response. */
  sawToolOutput: boolean;
  metered: boolean;
}

export const createStepAccumulator = (
  position: CodexEntryPosition,
  model: string | null,
  effort: string | null,
): CodexStepAccumulator => ({
  step: {
    step_id: 0,
    ...(position.timestamp ? { timestamp: position.timestamp } : {}),
    source: "agent",
    ...(model ? { model_name: model } : {}),
    ...(effort ? { reasoning_effort: effort } : {}),
    message: "",
    ...(position.copied ? { is_copied_context: true } : {}),
    ...(position.reverted ? { extra: { reverted: true } } : {}),
  },
  texts: [],
  reasoning: [],
  encryptedReasoning: false,
  toolCalls: [],
  messageIds: [],
  phases: [],
  sawToolOutput: false,
  metered: false,
});

export const addModelOutput = (
  accumulator: CodexStepAccumulator,
  entry: ModelOutputEntry,
): void => {
  switch (entry.kind) {
    case "assistant":
      accumulator.texts.push(entry.text);
      addUnique(accumulator.messageIds, entry.messageId);
      addUnique(accumulator.phases, entry.phase);
      break;
    case "reasoning":
      accumulator.reasoning.push(entry.summary, entry.content);
      accumulator.encryptedReasoning ||= entry.encrypted;
      break;
    case "tool-call":
      accumulator.toolCalls.push(entry.call);
      break;
  }
};

export const addUsage = (
  accumulator: CodexStepAccumulator,
  usage: CodexTokenUsage,
  responseId: string | null,
): void => {
  accumulator.step.metrics = usageToMetrics(usage, responseId);
  accumulator.metered = true;
};

export const finalizeStep = (accumulator: CodexStepAccumulator): void => {
  const { step } = accumulator;
  step.message = joinNonEmpty(accumulator.texts);
  const reasoning = joinNonEmpty(accumulator.reasoning);
  if (reasoning) {
    step.reasoning_content = reasoning;
  }
  if (accumulator.toolCalls.length > 0) {
    step.tool_calls = accumulator.toolCalls;
  }
  if (!step.is_copied_context) {
    step.llm_call_count = 1;
  }
  const isUsageOnly =
    accumulator.texts.length === 0 &&
    accumulator.reasoning.length === 0 &&
    accumulator.toolCalls.length === 0;
  const extra = {
    ...step.extra,
    ...(accumulator.messageIds.length > 0
      ? { message_ids: accumulator.messageIds }
      : {}),
    ...(accumulator.phases.length > 0 ? { phases: accumulator.phases } : {}),
    ...(accumulator.encryptedReasoning ? { encrypted_reasoning: true } : {}),
    ...(isUsageOnly ? { usage_only: true } : {}),
  };
  if (Object.keys(extra).length > 0) {
    step.extra = extra;
  }
};

const addUnique = (values: string[], value: string | null): void => {
  if (value !== null && !values.includes(value)) {
    values.push(value);
  }
};

const joinNonEmpty = (parts: string[]): string =>
  parts.filter((part) => part.length > 0).join("\n\n");
