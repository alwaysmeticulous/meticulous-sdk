import type { AtifMetrics } from "../types/atif.types";
import { asNumber, asRecord } from "../utils/json-guards";
import type { PiUsage } from "./pi-message.types";

export const parsePiUsage = (value: unknown): PiUsage | null => {
  const usage = asRecord(value);
  if (!usage) {
    return null;
  }
  return {
    input: asNumber(usage["input"]) ?? 0,
    output: asNumber(usage["output"]) ?? 0,
    cacheRead: asNumber(usage["cacheRead"]) ?? 0,
    cacheWrite: asNumber(usage["cacheWrite"]) ?? 0,
    cacheWrite1h: asNumber(usage["cacheWrite1h"]),
    reasoning: asNumber(usage["reasoning"]),
    costUsd: asNumber(asRecord(usage["cost"])?.["total"]),
  };
};

/**
 * Pi's `input` excludes cache reads and writes, so ATIF's all-inclusive
 * `prompt_tokens` is the sum of the three.
 */
export const piUsageToMetrics = (usage: PiUsage): AtifMetrics => ({
  prompt_tokens: usage.input + usage.cacheRead + usage.cacheWrite,
  completion_tokens: usage.output,
  cached_tokens: usage.cacheRead,
  ...(usage.costUsd !== null ? { cost_usd: usage.costUsd } : {}),
  extra: {
    input_tokens: usage.input,
    cache_creation_input_tokens: usage.cacheWrite,
    cache_read_input_tokens: usage.cacheRead,
    ...(usage.cacheWrite1h !== null
      ? { cache_creation_1h_input_tokens: usage.cacheWrite1h }
      : {}),
    ...(usage.reasoning !== null ? { reasoning_tokens: usage.reasoning } : {}),
  },
});
