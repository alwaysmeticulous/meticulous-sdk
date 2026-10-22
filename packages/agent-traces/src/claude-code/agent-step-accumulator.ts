import type { AtifStep, AtifToolCall } from "../types/atif.types";
import type { AssistantEntry, TranscriptUsage } from "./transcript.types";
import {
  isZeroUsage,
  SYNTHETIC_MODEL,
  usageToMetrics,
} from "./usage-to-metrics";

/**
 * Collects every line of one assistant message (Claude Code writes each
 * content block as its own line, possibly interleaved with tool results)
 * into a single ATIF agent step.
 */
export interface AgentStepAccumulator {
  step: AtifStep;
  messageId: string;
  texts: string[];
  reasoning: string[];
  toolCalls: AtifToolCall[];
  /** Every line repeats the usage; later lines carry the final counts. */
  usage: TranscriptUsage | null;
  model: string | null;
  stopReason: string | null;
  requestId: string | null;
  otherBlockTypes: Set<string>;
}

export const createAgentStepAccumulator = (
  messageId: string,
  timestamp: string | null,
): AgentStepAccumulator => ({
  step: {
    step_id: 0,
    ...(timestamp ? { timestamp } : {}),
    source: "agent",
    message: "",
  },
  messageId,
  texts: [],
  reasoning: [],
  toolCalls: [],
  usage: null,
  model: null,
  stopReason: null,
  requestId: null,
  otherBlockTypes: new Set(),
});

/** Returns the ids of any tool calls the entry added. */
export const addAssistantEntry = (
  accumulator: AgentStepAccumulator,
  entry: AssistantEntry,
): string[] => {
  const newToolCallIds: string[] = [];
  for (const block of entry.blocks) {
    switch (block.type) {
      case "text":
        accumulator.texts.push(block.text);
        break;
      case "thinking":
        accumulator.reasoning.push(block.thinking);
        break;
      case "tool_use":
        accumulator.toolCalls.push({
          tool_call_id: block.id,
          function_name: block.name,
          arguments: block.input,
        });
        newToolCallIds.push(block.id);
        break;
      case "other":
        accumulator.otherBlockTypes.add(block.originalType);
        break;
    }
  }
  accumulator.usage = entry.usage ?? accumulator.usage;
  accumulator.model = entry.model ?? accumulator.model;
  accumulator.stopReason = entry.stopReason ?? accumulator.stopReason;
  accumulator.requestId = entry.requestId ?? accumulator.requestId;
  return newToolCallIds;
};

export const finalizeAgentStep = (accumulator: AgentStepAccumulator): void => {
  const { step, usage, model } = accumulator;
  const isSynthetic = model === SYNTHETIC_MODEL;
  step.message = joinNonEmpty(accumulator.texts);
  const reasoning = joinNonEmpty(accumulator.reasoning);
  if (reasoning) {
    step.reasoning_content = reasoning;
  }
  if (model && !isSynthetic) {
    step.model_name = model;
  }
  if (accumulator.toolCalls.length > 0) {
    step.tool_calls = accumulator.toolCalls;
  }
  if (usage && !(isSynthetic && isZeroUsage(usage))) {
    step.metrics = usageToMetrics(usage);
  }
  if (!isSynthetic) {
    step.llm_call_count = 1;
  }
  step.extra = {
    ...step.extra,
    message_id: accumulator.messageId,
    ...(accumulator.requestId ? { request_id: accumulator.requestId } : {}),
    ...(accumulator.stopReason ? { stop_reason: accumulator.stopReason } : {}),
    ...(isSynthetic ? { synthetic: true } : {}),
    ...(accumulator.otherBlockTypes.size > 0
      ? { unconverted_block_types: [...accumulator.otherBlockTypes] }
      : {}),
  };
};

const joinNonEmpty = (parts: string[]): string =>
  parts.filter((part) => part.length > 0).join("\n\n");
