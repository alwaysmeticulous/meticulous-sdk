import {
  ATIF_SCHEMA_VERSION,
  type AtifExtra,
  type AtifStep,
  type AtifTrajectory,
} from "../types/atif.types";
import { countModels, type TokenTotals } from "./token-totals";

export const buildLeafTrajectory = ({
  sessionId,
  trajectoryId,
  agentName,
  agentVersion,
  steps,
  totals,
  extra,
  totalCostUsd,
}: {
  sessionId: string;
  trajectoryId?: string | null;
  agentName: string;
  agentVersion: string;
  steps: AtifStep[];
  totals: TokenTotals;
  extra: AtifExtra;
  totalCostUsd?: number;
}): AtifTrajectory => {
  const trajectory: AtifTrajectory = {
    schema_version: ATIF_SCHEMA_VERSION,
    session_id: sessionId,
    ...(trajectoryId ? { trajectory_id: trajectoryId } : {}),
    agent: { name: agentName, version: agentVersion },
    steps,
    final_metrics: {
      total_prompt_tokens: totals.promptTokens,
      total_completion_tokens: totals.completionTokens,
      total_cached_tokens: totals.cachedTokens,
      ...(totalCostUsd !== undefined ? { total_cost_usd: totalCostUsd } : {}),
      total_steps: steps.length,
      extra: { total_cache_creation_tokens: totals.cacheCreationTokens },
    },
    extra,
  };
  const mostUsedModel = countModels([trajectory])[0]?.[0];
  if (mostUsedModel) {
    trajectory.agent.model_name = mostUsedModel;
  }
  return trajectory;
};
