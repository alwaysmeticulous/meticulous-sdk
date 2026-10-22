import type { AtifMetrics } from "../types/atif.types";

/**
 * A step's tokens split into disjoint buckets. ATIF's `prompt_tokens` counts
 * every input token, so `input` here is only the uncached remainder.
 */
export interface AtifStepTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const getAtifStepTokens = (
  metrics: AtifMetrics | undefined,
): AtifStepTokens => {
  if (!metrics) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  const cacheRead = metrics.cached_tokens ?? 0;
  const cacheWrite = getAtifCacheCreationTokens(metrics);
  return {
    input: Math.max(0, (metrics.prompt_tokens ?? 0) - cacheRead - cacheWrite),
    output: metrics.completion_tokens ?? 0,
    cacheRead,
    cacheWrite,
  };
};

export const getAtifCacheCreationTokens = (metrics: AtifMetrics): number => {
  const cacheCreation = metrics.extra?.["cache_creation_input_tokens"];
  return typeof cacheCreation === "number" ? cacheCreation : 0;
};
