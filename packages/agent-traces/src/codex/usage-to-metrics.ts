import type { AtifMetrics } from "../types/atif.types";
import type { CodexTokenUsage } from "./codex-entry.types";

/**
 * Codex reports OpenAI-style usage, where `input_tokens` already includes
 * the cached and cache-write subsets, matching ATIF's `prompt_tokens`; and
 * `output_tokens` includes reasoning.
 */
export const usageToMetrics = (
  usage: CodexTokenUsage,
  responseId: string | null,
): AtifMetrics => ({
  prompt_tokens: usage.inputTokens,
  completion_tokens: usage.outputTokens,
  cached_tokens: usage.cachedInputTokens,
  extra: {
    cache_creation_input_tokens: usage.cacheWriteInputTokens,
    reasoning_output_tokens: usage.reasoningOutputTokens,
    total_tokens: usage.totalTokens,
    ...(responseId ? { response_id: responseId } : {}),
  },
});
