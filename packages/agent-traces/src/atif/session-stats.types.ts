import type { AgentTracePullRequest } from "../types/summary.types";
import type { ActivityStats } from "./activity-stats";
import type { TokenTotals } from "./token-totals";

/** What each agent's converter reports about a session, for its summary. */
export interface SessionStats {
  cwd: string | null;
  gitBranch: string | null;
  gitBranches: string[];
  pullRequests: AgentTracePullRequest[];
  agentVersion: string | null;
  entrypoint: string | null;
  permissionModes: string[];
  title: string | null;
  models: string[];
  startedAt: string | null;
  endedAt: string | null;
  /** Steps in the root trajectory, matching `final_metrics.total_steps`. */
  stepCount: number;
  subagentCount: number;
  /** Includes every subagent, matching the root's `final_metrics`. */
  totals: TokenTotals;
  reportedCostUsd: number | null;
  activity: ActivityStats;
}
