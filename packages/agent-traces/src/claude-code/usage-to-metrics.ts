import type { AtifMetrics } from "../types/atif.types";
import type { TranscriptUsage } from "./transcript.types";

/** Claude Code's placeholder model for locally generated messages. */
export const SYNTHETIC_MODEL = "<synthetic>";

/**
 * ATIF's `prompt_tokens` counts every input token, so Anthropic's three
 * input buckets are summed, with the cache-read bucket also reported as
 * `cached_tokens`.
 */
export const usageToMetrics = (usage: TranscriptUsage): AtifMetrics => ({
  prompt_tokens:
    usage.inputTokens +
    usage.cacheCreationInputTokens +
    usage.cacheReadInputTokens,
  completion_tokens: usage.outputTokens,
  cached_tokens: usage.cacheReadInputTokens,
  extra: {
    input_tokens: usage.inputTokens,
    cache_creation_input_tokens: usage.cacheCreationInputTokens,
    cache_read_input_tokens: usage.cacheReadInputTokens,
    ...(usage.thinkingTokens !== null
      ? { thinking_tokens: usage.thinkingTokens }
      : {}),
    ...(usage.serviceTier ? { service_tier: usage.serviceTier } : {}),
    ...(usage.cacheCreation ? { cache_creation: usage.cacheCreation } : {}),
  },
});

export const isZeroUsage = (usage: TranscriptUsage): boolean =>
  usage.inputTokens === 0 &&
  usage.outputTokens === 0 &&
  usage.cacheCreationInputTokens === 0 &&
  usage.cacheReadInputTokens === 0;
