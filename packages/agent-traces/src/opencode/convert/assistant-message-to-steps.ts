import type { AtifStep } from "../../types/atif.types";
import type { JsonRecord } from "../../utils/json-guards";
import { asNonEmptyString, asNumber, asRecord } from "../../utils/json-guards";
import type { OpenCodeExportMessage } from "../opencode-export.types";
import type { SubagentLink } from "./collect-assistant-parts";
import { collectAssistantParts } from "./collect-assistant-parts";
import { messageTimestamp } from "./message-time";
import type { TokenSemantics } from "./opencode-tokens";
import {
  isZeroOpenCodeTokens,
  openCodeTokensToMetrics,
  parseOpenCodeTokens,
  ZERO_OPENCODE_TOKENS,
} from "./opencode-tokens";

interface AssistantSteps {
  steps: AtifStep[];
  subagentLinks: SubagentLink[];
}

/**
 * One agent step per assistant message, which can span several LLM calls.
 * A compaction's summary message also gets a user step carrying the summary,
 * as that's the context the conversation continues from.
 */
export const assistantMessageToSteps = (
  { info, parts }: OpenCodeExportMessage,
  compaction: { auto: boolean } | null,
  tokenSemantics: TokenSemantics,
): AssistantSteps => {
  const collected = collectAssistantParts(parts);
  // Messages from before step-finish parts existed only carry a total.
  const tokens =
    collected.llmCallCount > 0
      ? collected.stepTokens
      : (parseOpenCodeTokens(info["tokens"]) ?? ZERO_OPENCODE_TOKENS);
  const costUsd = asNumber(info["cost"]);
  const hasUsage = !isZeroOpenCodeTokens(tokens) || (costUsd ?? 0) > 0;
  const modelId = asNonEmptyString(info["modelID"]);
  const timestamp = messageTimestamp(info, "created");
  const message = joinNonEmpty(collected.texts);
  const reasoning = joinNonEmpty(collected.reasoning);
  const agentStep: AtifStep = {
    step_id: 0,
    ...(timestamp ? { timestamp } : {}),
    source: "agent",
    ...(modelId ? { model_name: modelId } : {}),
    message: compaction ? "" : message,
    ...(reasoning ? { reasoning_content: reasoning } : {}),
    ...(collected.toolCalls.length > 0
      ? { tool_calls: collected.toolCalls }
      : {}),
    ...(collected.results.length > 0
      ? { observation: { results: collected.results } }
      : {}),
    ...(hasUsage
      ? { metrics: openCodeTokensToMetrics(tokens, costUsd, tokenSemantics) }
      : {}),
    ...(collected.llmCallCount > 0
      ? { llm_call_count: collected.llmCallCount }
      : {}),
    extra: {
      ...describeMessage(info),
      ...(compaction
        ? { compaction: true, compaction_auto: compaction.auto }
        : {}),
      ...(collected.patchedFiles.length > 0
        ? { patched_files: collected.patchedFiles }
        : {}),
      ...(collected.retryCount > 0
        ? { retry_count: collected.retryCount }
        : {}),
      ...(collected.otherPartTypes.size > 0
        ? { unconverted_part_types: [...collected.otherPartTypes] }
        : {}),
    },
  };
  if (!compaction) {
    return { steps: [agentStep], subagentLinks: collected.subagentLinks };
  }
  const completedAt = messageTimestamp(info, "completed") ?? timestamp;
  const summaryStep: AtifStep = {
    step_id: 0,
    ...(completedAt ? { timestamp: completedAt } : {}),
    source: "user",
    message,
    extra: { message_id: info["id"], is_compact_summary: true },
  };
  return {
    steps: [agentStep, summaryStep],
    subagentLinks: collected.subagentLinks,
  };
};

const describeMessage = (info: JsonRecord): JsonRecord => {
  const error = asRecord(info["error"]);
  const fields: JsonRecord = {
    message_id: info["id"],
    provider_id: asNonEmptyString(info["providerID"]),
    agent: asNonEmptyString(info["agent"]),
    finish_reason: asNonEmptyString(info["finish"]),
    variant: asNonEmptyString(info["variant"]),
    error: error
      ? {
          name: asNonEmptyString(error["name"]),
          message: asNonEmptyString(asRecord(error["data"])?.["message"]),
        }
      : null,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null),
  );
};

const joinNonEmpty = (parts: string[]): string =>
  parts.filter((part) => part.length > 0).join("\n\n");
