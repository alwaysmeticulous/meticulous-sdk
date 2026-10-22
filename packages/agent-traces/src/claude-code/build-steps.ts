import { ATIF_EXTRA_DURATION_MS } from "../atif/tool-result-duration";
import type { AtifStep } from "../types/atif.types";
import { assertNever } from "../utils/assert-never";
import type { AgentStepAccumulator } from "./agent-step-accumulator";
import {
  addAssistantEntry,
  createAgentStepAccumulator,
  finalizeAgentStep,
} from "./agent-step-accumulator";
import { getElapsedMs } from "../atif/elapsed-ms";
import { truncateObservationContent } from "../atif/truncate-observation-content";
import type {
  AssistantEntry,
  TranscriptEntry,
  UserBlock,
  UserEntry,
} from "./transcript.types";

interface BuildContext {
  steps: AtifStep[];
  accumulatorsByMessageId: Map<string, AgentStepAccumulator>;
  stepsByToolCallId: Map<string, AtifStep>;
  /** When the line issuing each tool call was written. */
  toolCallTimestamps: Map<string, string>;
  anonymousMessageCount: number;
}

/**
 * Converts one transcript's entries into ATIF steps. Each assistant message
 * becomes one agent step, positioned where its first line appeared; tool
 * results attach to the step that issued the call.
 */
export const buildSteps = (entries: TranscriptEntry[]): AtifStep[] => {
  const context: BuildContext = {
    steps: [],
    accumulatorsByMessageId: new Map(),
    stepsByToolCallId: new Map(),
    toolCallTimestamps: new Map(),
    anonymousMessageCount: 0,
  };
  for (const entry of entries) {
    switch (entry.kind) {
      case "assistant":
        addAssistant(context, entry);
        break;
      case "user":
        addUser(context, entry);
        break;
      default:
        assertNever(entry);
    }
  }
  context.accumulatorsByMessageId.forEach(finalizeAgentStep);
  context.steps.forEach((step, index) => {
    step.step_id = index + 1;
  });
  return context.steps;
};

const addAssistant = (context: BuildContext, entry: AssistantEntry) => {
  const messageId =
    entry.messageId ?? `anonymous-${++context.anonymousMessageCount}`;
  let accumulator = context.accumulatorsByMessageId.get(messageId);
  if (!accumulator) {
    accumulator = createAgentStepAccumulator(messageId, entry.timestamp);
    context.accumulatorsByMessageId.set(messageId, accumulator);
    context.steps.push(accumulator.step);
  }
  for (const toolCallId of addAssistantEntry(accumulator, entry)) {
    context.stepsByToolCallId.set(toolCallId, accumulator.step);
    if (entry.timestamp) {
      context.toolCallTimestamps.set(toolCallId, entry.timestamp);
    }
  }
};

const addUser = (context: BuildContext, entry: UserEntry) => {
  const texts: string[] = [];
  for (const block of entry.blocks) {
    if (block.type === "text") {
      texts.push(block.text);
    } else if (block.type === "tool_result") {
      attachToolResult(context, block, entry.timestamp);
    }
  }
  // Meta lines are Claude Code's own injected context, not user prompts.
  if (entry.isMeta || texts.length === 0) {
    return;
  }
  context.steps.push({
    step_id: 0,
    ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    source: "user",
    message: texts.join("\n\n"),
    extra: {
      ...(entry.uuid ? { uuid: entry.uuid } : {}),
      ...(entry.originKind ? { origin_kind: entry.originKind } : {}),
      ...(entry.isCompactSummary ? { is_compact_summary: true } : {}),
    },
  });
};

const attachToolResult = (
  context: BuildContext,
  block: Extract<UserBlock, { type: "tool_result" }>,
  timestamp: string | null,
) => {
  const { content, originalLength } = truncateObservationContent(block.content);
  // Wall-clock, so it includes any time spent waiting on a permission prompt.
  const durationMs = getElapsedMs(
    context.toolCallTimestamps.get(block.toolUseId),
    timestamp,
  );
  const extra = {
    is_error: block.isError,
    ...(originalLength !== null
      ? { truncated: true, original_length_chars: originalLength }
      : {}),
    ...(durationMs !== null ? { [ATIF_EXTRA_DURATION_MS]: durationMs } : {}),
  };
  const step = context.stepsByToolCallId.get(block.toolUseId);
  if (step) {
    step.observation ??= { results: [] };
    step.observation.results.push({
      source_call_id: block.toolUseId,
      content,
      extra,
    });
    return;
  }
  // The call isn't in this transcript (e.g. it was compacted away), and ATIF
  // only allows `source_call_id` to reference a call in the same step.
  context.steps.push({
    step_id: 0,
    ...(timestamp ? { timestamp } : {}),
    source: "system",
    message: "",
    observation: {
      results: [
        { content, extra: { ...extra, orphan_tool_use_id: block.toolUseId } },
      ],
    },
  });
};
