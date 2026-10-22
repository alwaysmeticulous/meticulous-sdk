import type {
  AtifObservationResult,
  AtifStep,
  AtifToolCall,
} from "../../types/atif.types";
import type { CursorThoughtEvent } from "../events/cursor-hook-event.types";
import type { CursorTimelineMessage } from "../merge/cursor-timeline.types";
import type { CursorAssistantEntry } from "../transcript/cursor-transcript.types";
import { applyResponseUsage } from "./apply-cursor-usage";
import type { CursorStepContext } from "./cursor-step-context";
import {
  nextToolCallId,
  noteModel,
  pushAgentStep,
} from "./cursor-step-context";
import { toToolCall, toToolResult } from "./tool-call-parts";

/**
 * One transcript message, with whatever its hook events add: tool outputs,
 * reasoning, timing, model and usage. Tool calls take the hook's id, since
 * the transcript has none.
 */
export const addMessageStep = (
  context: CursorStepContext,
  { entry, toolEvents, thoughts, responses }: CursorTimelineMessage,
): void => {
  context.openStep = null;
  const events = [
    ...thoughts,
    ...toolEvents.flatMap((e) => (e ? [e] : [])),
    ...responses,
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  events.forEach((event) => noteModel(context, event.model));
  const toolCalls: AtifToolCall[] = [];
  const results: AtifObservationResult[] = [];
  entry.toolUses.forEach((use, index) => {
    const event = toolEvents[index] ?? null;
    const id = event?.toolUseId ?? use.id ?? nextToolCallId(context);
    toolCalls.push(
      toToolCall(id, use.name, use.input, event?.toolName ?? null),
    );
    if (event) {
      results.push(toToolResult(id, event));
    }
  });
  const { message, reasoning } = separateReasoning(entry, thoughts);
  const first = events[0];
  const model = events.find((event) => event.model)?.model;
  const generationId = events.find((event) => event.generationId)?.generationId;
  const step: AtifStep = {
    step_id: 0,
    ...(first ? { timestamp: first.timestamp } : {}),
    source: "agent",
    ...(model ? { model_name: model } : {}),
    message,
    ...(reasoning ? { reasoning_content: reasoning } : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(results.length > 0 ? { observation: { results } } : {}),
    llm_call_count: 1,
    extra: {
      ...(generationId ? { generation_id: generationId } : {}),
      ...(entry.reasoningRedacted && !reasoning
        ? { reasoning_redacted: true }
        : {}),
      ...(entry.otherBlockTypes.length > 0
        ? { unconverted_block_types: entry.otherBlockTypes }
        : {}),
    },
  };
  pushAgentStep(context, step);
  const usage = responses
    .flatMap((response) => (response.usage ? [response.usage] : []))
    .at(-1);
  applyResponseUsage(context, step, usage ?? null);
};

/** Cursor appends reasoning to a message's text; thought events say which part it is. */
const separateReasoning = (
  entry: CursorAssistantEntry,
  thoughts: CursorThoughtEvent[],
): { message: string; reasoning: string | null } => {
  let message = entry.text;
  const reasoning = entry.reasoning ? [entry.reasoning] : [];
  for (const { text } of thoughts) {
    if (text.length > 0 && message.includes(text)) {
      message = message
        .replace(text, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    if (!reasoning.some((part) => part.includes(text))) {
      reasoning.push(text);
    }
  }
  const joined = reasoning.filter((part) => part.length > 0).join("\n\n");
  return { message, reasoning: joined.length > 0 ? joined : null };
};
