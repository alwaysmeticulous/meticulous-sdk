import type { AtifTrajectory } from "../types/atif.types";
import { computeActivityStats } from "../atif/activity-stats";
import { linkSubagentToToolCall } from "../atif/link-subagent";
import type { SessionStats } from "../atif/session-stats.types";
import { addTokenTotals, countModels } from "../atif/token-totals";
import type { ConvertedTranscript } from "./convert-transcript";
import { convertTranscript } from "./convert-transcript";
import { parseSubagentMeta } from "./parse-subagent-meta";
import type { TranscriptMetadata } from "./transcript.types";

export interface ClaudeCodeSessionInput {
  sessionId: string;
  mainText: string;
  subagents: Array<{ agentId: string; text: string; metaText: string | null }>;
}

interface ConvertedSession {
  trajectory: AtifTrajectory;
  stats: SessionStats;
}

/**
 * Converts a session and its subagents into one ATIF document: subagents
 * are embedded flat in `subagent_trajectories` (even when nested) and
 * referenced from the tool call that spawned them.
 */
export const convertClaudeCodeSession = (
  transcripts: ClaudeCodeSessionInput,
  converterVersion: string,
): ConvertedSession => {
  const { sessionId } = transcripts;
  const main = convertTranscript({
    text: transcripts.mainText,
    sessionId,
    trajectoryId: null,
    extra: {},
  });
  const subagents = transcripts.subagents.map((subagent) =>
    convertSubagent(sessionId, subagent),
  );
  const subagentTrajectories = subagents.map(
    ({ converted }) => converted.trajectory,
  );
  const allTrajectories = [main.trajectory, ...subagentTrajectories];
  for (const { trajectoryId, meta } of subagents) {
    if (meta.toolUseId) {
      linkSubagentToToolCall(allTrajectories, meta.toolUseId, {
        trajectory_id: trajectoryId,
        session_id: sessionId,
        extra: { agent_type: meta.agentType, description: meta.description },
      });
    }
  }

  const all = [main, ...subagents.map(({ converted }) => converted)];
  const totals = all.map((c) => c.totals).reduce(addTokenTotals);
  const metadata = main.metadata;
  const title =
    metadata.customTitle ?? metadata.aiTitle ?? metadata.summaryTitle;
  const root: AtifTrajectory = {
    ...main.trajectory,
    notes:
      `Converted from Claude Code transcripts by meticulous-agent-traces ${converterVersion}. ` +
      "final_metrics totals include every embedded subagent trajectory; total_steps counts root steps only.",
    final_metrics: {
      total_prompt_tokens: totals.promptTokens,
      total_completion_tokens: totals.completionTokens,
      total_cached_tokens: totals.cachedTokens,
      total_steps: main.trajectory.steps.length,
      extra: {
        includes_subagent_trajectories: true,
        total_cache_creation_tokens: totals.cacheCreationTokens,
        total_steps_including_subagents: allTrajectories.reduce(
          (sum, trajectory) => sum + trajectory.steps.length,
          0,
        ),
        ...(metadata.reportedCostUsd !== null
          ? { claude_code_reported_cost_usd: metadata.reportedCostUsd }
          : {}),
      },
    },
    extra: {
      ...main.trajectory.extra,
      cwd: metadata.cwd,
      gitBranch: metadata.gitBranch,
      title,
      slug: metadata.slug,
    },
    ...(subagentTrajectories.length > 0
      ? { subagent_trajectories: subagentTrajectories }
      : {}),
  };
  return {
    trajectory: root,
    stats: {
      cwd: metadata.cwd,
      gitBranch: metadata.gitBranch,
      gitBranches: metadata.gitBranches,
      pullRequests: metadata.pullRequests,
      agentVersion: metadata.version,
      entrypoint: metadata.entrypoint,
      permissionModes: metadata.permissionModes,
      title,
      models: countModels(allTrajectories).map(([model]) => model),
      ...getTimeRange(all.map((c) => c.metadata)),
      stepCount: main.trajectory.steps.length,
      subagentCount: subagents.length,
      totals,
      reportedCostUsd: metadata.reportedCostUsd,
      activity: computeActivityStats(root, allTrajectories),
    },
  };
};

const convertSubagent = (
  sessionId: string,
  subagent: ClaudeCodeSessionInput["subagents"][number],
) => {
  const meta = parseSubagentMeta(subagent.metaText);
  const trajectoryId = `agent-${subagent.agentId}`;
  const converted: ConvertedTranscript = convertTranscript({
    text: subagent.text,
    sessionId,
    trajectoryId,
    extra: {
      agent_id: subagent.agentId,
      agent_type: meta.agentType,
      description: meta.description,
      parent_tool_use_id: meta.toolUseId,
      spawn_depth: meta.spawnDepth,
    },
  });
  return { converted, meta, trajectoryId };
};

const getTimeRange = (
  metadatas: TranscriptMetadata[],
): { startedAt: string | null; endedAt: string | null } => {
  const starts = metadatas.flatMap((m) => (m.startedAt ? [m.startedAt] : []));
  const ends = metadatas.flatMap((m) => (m.endedAt ? [m.endedAt] : []));
  return {
    startedAt: starts.sort()[0] ?? null,
    endedAt: ends.sort().at(-1) ?? null,
  };
};
