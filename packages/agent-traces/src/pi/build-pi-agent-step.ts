import type { AtifStep } from "../types/atif.types";
import { truncateObservationContent } from "../atif/truncate-observation-content";
import type { PiEntry } from "./pi-entry.types";
import type {
  PiAssistantMessage,
  PiToolResultMessage,
} from "./pi-message.types";
import { piUsageToMetrics } from "./pi-usage";

/** One agent step per assistant message; Pi writes each as a single entry. */
export const buildPiAgentStep = (
  entry: PiEntry,
  message: PiAssistantMessage,
): AtifStep => {
  const step: AtifStep = {
    step_id: 0,
    ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    source: "agent",
    message: joinNonEmpty(message.texts),
    llm_call_count: 1,
  };
  const reasoning = joinNonEmpty(message.reasoning);
  if (reasoning) {
    step.reasoning_content = reasoning;
  }
  const model = message.responseModel ?? message.model;
  if (model) {
    step.model_name = model;
  }
  if (message.thinkingLevel) {
    step.reasoning_effort = message.thinkingLevel;
  }
  if (message.toolCalls.length > 0) {
    step.tool_calls = message.toolCalls.map((call) => ({
      tool_call_id: call.id,
      function_name: call.name,
      arguments: call.arguments,
    }));
  }
  if (message.usage) {
    step.metrics = piUsageToMetrics(message.usage);
  }
  step.extra = {
    entry_id: entry.id,
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.api ? { api: message.api } : {}),
    ...(message.responseModel && message.model !== message.responseModel
      ? { requested_model: message.model }
      : {}),
    ...(message.responseId ? { response_id: message.responseId } : {}),
    ...(message.stopReason ? { stop_reason: message.stopReason } : {}),
    ...(message.errorMessage ? { error_message: message.errorMessage } : {}),
    ...(message.redactedThinkingCount > 0
      ? { redacted_thinking_block_count: message.redactedThinkingCount }
      : {}),
    ...(message.otherBlockTypes.length > 0
      ? { unconverted_block_types: message.otherBlockTypes }
      : {}),
  };
  return step;
};

/** The observation result for a tool call, without `source_call_id`. */
export const buildPiToolResult = (message: PiToolResultMessage) => {
  const { content, originalLength } = truncateObservationContent(
    message.content.texts.join("\n"),
  );
  return {
    content,
    extra: {
      is_error: message.isError,
      ...(message.toolName ? { tool_name: message.toolName } : {}),
      ...(message.content.imageCount > 0
        ? { image_count: message.content.imageCount }
        : {}),
      ...(message.usage
        ? { nested_metrics: piUsageToMetrics(message.usage) }
        : {}),
      ...(originalLength !== null
        ? { truncated: true, original_length_chars: originalLength }
        : {}),
    },
  };
};

/**
 * For a result whose call isn't on the active branch: ATIF only allows
 * `source_call_id` to reference a call in the same step.
 */
export const buildOrphanToolResultStep = (
  entry: PiEntry,
  message: PiToolResultMessage,
): AtifStep => {
  const result = buildPiToolResult(message);
  return {
    step_id: 0,
    ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    source: "system",
    message: "",
    observation: {
      results: [
        {
          content: result.content,
          extra: { ...result.extra, orphan_tool_call_id: message.toolCallId },
        },
      ],
    },
  };
};

const joinNonEmpty = (parts: string[]): string =>
  parts.filter((part) => part.length > 0).join("\n\n");
