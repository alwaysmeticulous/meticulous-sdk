import { getAtifCacheCreationTokens } from "./step-token-breakdown";
import type { AtifStep, AtifTrajectory } from "../types/atif.types";

export interface TokenTotals {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
}

const ZERO_TOKEN_TOTALS: TokenTotals = {
  promptTokens: 0,
  completionTokens: 0,
  cachedTokens: 0,
  cacheCreationTokens: 0,
};

export const sumStepTokens = (steps: AtifStep[]): TokenTotals =>
  steps.reduce<TokenTotals>((totals, step) => {
    const metrics = step.metrics;
    if (!metrics) {
      return totals;
    }
    return addTokenTotals(totals, {
      promptTokens: metrics.prompt_tokens ?? 0,
      completionTokens: metrics.completion_tokens ?? 0,
      cachedTokens: metrics.cached_tokens ?? 0,
      cacheCreationTokens: getAtifCacheCreationTokens(metrics),
    });
  }, ZERO_TOKEN_TOTALS);

export const addTokenTotals = (
  a: TokenTotals,
  b: TokenTotals,
): TokenTotals => ({
  promptTokens: a.promptTokens + b.promptTokens,
  completionTokens: a.completionTokens + b.completionTokens,
  cachedTokens: a.cachedTokens + b.cachedTokens,
  cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
});

/** Counts agent steps per model, most used first. */
export const countModels = (
  trajectories: AtifTrajectory[],
): Array<[string, number]> => {
  const counts = new Map<string, number>();
  for (const trajectory of trajectories) {
    for (const step of trajectory.steps) {
      if (step.source === "agent" && step.model_name) {
        counts.set(step.model_name, (counts.get(step.model_name) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};
