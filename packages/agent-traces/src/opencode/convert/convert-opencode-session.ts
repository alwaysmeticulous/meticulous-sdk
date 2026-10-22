import type { AtifTrajectory } from "../../types/atif.types";
import { computeActivityStats } from "../../atif/activity-stats";
import { linkSubagentToToolCall } from "../../atif/link-subagent";
import type { SessionStats } from "../../atif/session-stats.types";
import { addTokenTotals, countModels } from "../../atif/token-totals";
import { asNonEmptyString, asNumber } from "../../utils/json-guards";
import type {
  OpenCodeExport,
  OpenCodeExportSession,
} from "../opencode-export.types";
import type { ConvertedTranscript } from "./convert-opencode-transcript";
import { convertOpenCodeTranscript } from "./convert-opencode-transcript";
import { resolveSessionTitle } from "./resolve-session-title";

export interface OpenCodeConvertOptions {
  /** Read from the working tree at upload time; OpenCode doesn't record it. */
  gitBranch: string | null;
  converterVersion: string;
}

interface ConvertedSession {
  trajectory: AtifTrajectory;
  stats: SessionStats;
}

/**
 * Converts a root session and its descendant sessions into one ATIF
 * document: subagents are embedded flat in `subagent_trajectories` (even
 * when nested) and referenced from the `task` call that spawned them.
 */
export const convertOpenCodeSession = (
  exported: OpenCodeExport,
  { gitBranch, converterVersion }: OpenCodeConvertOptions,
): ConvertedSession => {
  const rootSessionId = asNonEmptyString(exported.info["id"]) ?? "unknown";
  const main = convertOpenCodeTranscript({
    session: exported,
    rootSessionId,
    trajectoryId: null,
    extra: {},
  });
  const children = exported.childSessions.map((child) => ({
    childSessionId: asNonEmptyString(child.info["id"]) ?? "unknown",
    converted: convertChild(rootSessionId, child),
  }));
  linkChildren(rootSessionId, main, children);

  const all = [main, ...children.map(({ converted }) => converted)];
  const allTrajectories = all.map(({ trajectory }) => trajectory);
  const totals = all.map((c) => c.totals).reduce(addTokenTotals);
  const totalCostUsd = all.reduce((sum, c) => sum + c.costUsd, 0);
  const reportedCostUsd = sumReportedCost([
    exported,
    ...exported.childSessions,
  ]);
  const cwd = asNonEmptyString(exported.info["directory"]);
  const title = resolveSessionTitle(exported.info, main.trajectory);
  const root: AtifTrajectory = {
    ...main.trajectory,
    notes:
      `Converted from the OpenCode database by meticulous-agent-traces ${converterVersion}. ` +
      "final_metrics totals include every embedded subagent trajectory; total_steps counts root steps only.",
    final_metrics: {
      total_prompt_tokens: totals.promptTokens,
      total_completion_tokens: totals.completionTokens,
      total_cached_tokens: totals.cachedTokens,
      total_cost_usd: totalCostUsd,
      total_steps: main.trajectory.steps.length,
      extra: {
        includes_subagent_trajectories: true,
        total_cache_creation_tokens: totals.cacheCreationTokens,
        total_steps_including_subagents: allTrajectories.reduce(
          (sum, trajectory) => sum + trajectory.steps.length,
          0,
        ),
      },
    },
    extra: {
      ...main.trajectory.extra,
      cwd,
      gitBranch,
      title,
      slug: asNonEmptyString(exported.info["slug"]),
      opencode_agent: asNonEmptyString(exported.info["agent"]),
      opencode_project_id: asNonEmptyString(exported.info["projectID"]),
      ...(exported.malformedRows.length > 0
        ? { malformed_row_count: exported.malformedRows.length }
        : {}),
    },
    ...(children.length > 0
      ? {
          subagent_trajectories: children.map(
            ({ converted }) => converted.trajectory,
          ),
        }
      : {}),
  };
  return {
    trajectory: root,
    stats: {
      cwd,
      gitBranch,
      gitBranches: gitBranch ? [gitBranch] : [],
      pullRequests: [],
      agentVersion: asNonEmptyString(exported.info["version"]),
      entrypoint: null,
      permissionModes: [],
      title,
      models: countModels(allTrajectories).map(([model]) => model),
      ...getTimeRange(all),
      stepCount: main.trajectory.steps.length,
      subagentCount: children.length,
      totals,
      reportedCostUsd,
      activity: computeActivityStats(root, allTrajectories),
    },
  };
};

const convertChild = (
  rootSessionId: string,
  child: OpenCodeExportSession,
): ConvertedTranscript => {
  const childSessionId = asNonEmptyString(child.info["id"]) ?? "unknown";
  return convertOpenCodeTranscript({
    session: child,
    rootSessionId,
    trajectoryId: childSessionId,
    extra: {
      opencode_session_id: childSessionId,
      parent_session_id: asNonEmptyString(child.info["parentID"]),
      agent_type: asNonEmptyString(child.info["agent"]),
      title: asNonEmptyString(child.info["title"]),
    },
  });
};

/**
 * Links each `task` call to its child session within the trajectory that
 * made it, since call ids are only unique per session for some providers.
 */
const linkChildren = (
  rootSessionId: string,
  main: ConvertedTranscript,
  children: Array<{ childSessionId: string; converted: ConvertedTranscript }>,
) => {
  const childIds = new Set(
    children.map(({ childSessionId }) => childSessionId),
  );
  const agentTypes = new Map(
    children.map(({ childSessionId, converted }) => [
      childSessionId,
      converted.trajectory.extra?.["agent_type"] ?? null,
    ]),
  );
  for (const parent of [main, ...children.map(({ converted }) => converted)]) {
    for (const { toolCallId, childSessionId } of parent.subagentLinks) {
      if (childIds.has(childSessionId)) {
        linkSubagentToToolCall([parent.trajectory], toolCallId, {
          trajectory_id: childSessionId,
          session_id: rootSessionId,
          extra: { agent_type: agentTypes.get(childSessionId) ?? null },
        });
      }
    }
  }
};

const sumReportedCost = (sessions: OpenCodeExportSession[]): number | null => {
  const costs = sessions.flatMap(({ info }) => asNumber(info["cost"]) ?? []);
  return costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null;
};

const getTimeRange = (
  transcripts: ConvertedTranscript[],
): { startedAt: string | null; endedAt: string | null } => {
  const starts = transcripts.flatMap((t) => t.startedAtMs ?? []);
  const ends = transcripts.flatMap((t) => t.endedAtMs ?? []);
  return {
    startedAt:
      starts.length > 0 ? new Date(Math.min(...starts)).toISOString() : null,
    endedAt: ends.length > 0 ? new Date(Math.max(...ends)).toISOString() : null,
  };
};
