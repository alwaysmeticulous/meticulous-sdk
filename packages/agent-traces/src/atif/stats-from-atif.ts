import type { AtifTrajectory } from "../types/atif.types";
import { asNonEmptyString, asNumber, asRecord } from "../utils/json-guards";
import { computeActivityStats } from "./activity-stats";
import type { SessionStats } from "./session-stats.types";
import { titleFromPrompt } from "./title-from-prompt";
import type { TokenTotals } from "./token-totals";
import { addTokenTotals, countModels, sumStepTokens } from "./token-totals";
import { walkAtifTrajectories } from "./walk-trajectories";

/** For a trajectory that wasn't produced by one of our converters. */
export const statsFromAtif = (root: AtifTrajectory): SessionStats => {
  const all = walkAtifTrajectories(root).map(({ trajectory }) => trajectory);
  const extra = root.extra ?? {};
  const gitBranch = asNonEmptyString(extra["gitBranch"]);
  const timestamps = all
    .flatMap((trajectory) => trajectory.steps)
    .flatMap(({ timestamp }) =>
      timestamp && !Number.isNaN(Date.parse(timestamp))
        ? [new Date(timestamp).toISOString()]
        : [],
    )
    .sort();
  const models = countModels(all).map(([model]) => model);
  const rootModel = asNonEmptyString(root.agent.model_name);
  return {
    cwd: asNonEmptyString(extra["cwd"]),
    gitBranch,
    gitBranches: gitBranch ? [gitBranch] : [],
    pullRequests: [],
    agentVersion: asNonEmptyString(root.agent.version),
    entrypoint: null,
    permissionModes: [],
    title:
      asNonEmptyString(extra["title"]) ?? titleFromPrompt(firstPrompt(root)),
    models: models.length === 0 && rootModel ? [rootModel] : models,
    startedAt: timestamps[0] ?? null,
    endedAt: timestamps.at(-1) ?? null,
    stepCount: root.steps.length,
    subagentCount: all.length - 1,
    totals: tokenTotals(root, all),
    reportedCostUsd: asNumber(root.final_metrics?.total_cost_usd),
    activity: computeActivityStats(root, all),
  };
};

/** `final_metrics` where it has them, else the sum over every step. */
const tokenTotals = (
  root: AtifTrajectory,
  all: AtifTrajectory[],
): TokenTotals => {
  const summed = all
    .map((trajectory) => sumStepTokens(trajectory.steps))
    .reduce(addTokenTotals);
  const metrics = root.final_metrics;
  return {
    promptTokens: Math.round(
      asNumber(metrics?.total_prompt_tokens) ?? summed.promptTokens,
    ),
    completionTokens: Math.round(
      asNumber(metrics?.total_completion_tokens) ?? summed.completionTokens,
    ),
    cachedTokens: Math.round(
      asNumber(metrics?.total_cached_tokens) ?? summed.cachedTokens,
    ),
    cacheCreationTokens: Math.round(
      asNumber(asRecord(metrics?.extra)?.["total_cache_creation_tokens"]) ??
        summed.cacheCreationTokens,
    ),
  };
};

const firstPrompt = (root: AtifTrajectory): string | null => {
  const message = root.steps.find((step) => step.source === "user")?.message;
  if (typeof message === "string") {
    return message;
  }
  return (
    message
      ?.flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n") ?? null
  );
};
