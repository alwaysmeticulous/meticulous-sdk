import { asNumber, asRecord } from "../utils/json-guards";
import type { CodexTokenUsage } from "./codex-entry.types";

export const parseTokenUsage = (value: unknown): CodexTokenUsage | null => {
  const usage = asRecord(value);
  const inputTokens = asNumber(usage?.["input_tokens"]);
  const outputTokens = asNumber(usage?.["output_tokens"]);
  if (!usage || inputTokens === null || outputTokens === null) {
    return null;
  }
  return {
    inputTokens,
    cachedInputTokens: asNumber(usage["cached_input_tokens"]) ?? 0,
    cacheWriteInputTokens: asNumber(usage["cache_write_input_tokens"]) ?? 0,
    outputTokens,
    reasoningOutputTokens: asNumber(usage["reasoning_output_tokens"]) ?? 0,
    totalTokens: asNumber(usage["total_tokens"]) ?? inputTokens + outputTokens,
  };
};

export const isZeroUsage = (usage: CodexTokenUsage): boolean =>
  usage.inputTokens === 0 && usage.outputTokens === 0;
