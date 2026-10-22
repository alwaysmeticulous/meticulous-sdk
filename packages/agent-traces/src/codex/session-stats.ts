import type { ActivityStats } from "../atif/activity-stats";
import type { SessionStats } from "../atif/session-stats.types";
import type { TokenTotals } from "../atif/token-totals";
import type { CodexThreadMetadata } from "./thread-metadata";

interface SessionStatsInput {
  main: CodexThreadMetadata;
  /** The root thread and every subagent. */
  all: CodexThreadMetadata[];
  gitBranch: string | null;
  title: string | null;
  models: string[];
  stepCount: number;
  subagentCount: number;
  totals: TokenTotals;
  activity: ActivityStats;
}

export const buildSessionStats = ({
  main,
  all,
  gitBranch,
  title,
  models,
  stepCount,
  subagentCount,
  totals,
  activity,
}: SessionStatsInput): SessionStats => {
  const starts = all.flatMap((m) => (m.startedAt ? [m.startedAt] : []));
  const ends = all.flatMap((m) => (m.endedAt ? [m.endedAt] : []));
  return {
    cwd: main.cwd,
    gitBranch,
    gitBranches:
      main.gitBranches.length > 0
        ? main.gitBranches
        : gitBranch
          ? [gitBranch]
          : [],
    pullRequests: [],
    agentVersion: main.cliVersion,
    entrypoint: main.meta?.originator ?? null,
    permissionModes: main.collaborationModes,
    title,
    models,
    startedAt: starts.sort()[0] ?? null,
    endedAt: ends.sort().at(-1) ?? null,
    stepCount,
    subagentCount,
    totals,
    reportedCostUsd: null,
    activity,
  };
};
