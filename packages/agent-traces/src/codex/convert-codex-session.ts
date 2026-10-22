import type { AtifTrajectory } from "../types/atif.types";
import { computeActivityStats } from "../atif/activity-stats";
import { linkSubagentToToolCall } from "../atif/link-subagent";
import type { SessionStats } from "../atif/session-stats.types";
import { titleFromPrompt } from "../atif/title-from-prompt";
import { addTokenTotals, countModels } from "../atif/token-totals";
import type { ConvertedCodexThread } from "./convert-codex-thread";
import { convertCodexThread } from "./convert-codex-thread";
import type { RolloutFileText } from "./parse-thread";
import { buildSessionStats } from "./session-stats";

export interface CodexSessionInput {
  sessionId: string;
  root: RolloutFileText[];
  subagents: Array<{ threadId: string; files: RolloutFileText[] }>;
  /** The thread's name from Codex's session index, if it has one. */
  threadName: string | null;
  /** For rollouts that recorded no git info, e.g. reading `.git/HEAD` now. */
  readFallbackGitBranch: (cwd: string | null) => string | null;
}

interface ConvertedCodexSession {
  trajectory: AtifTrajectory;
  stats: SessionStats;
}

/**
 * Converts a thread and the threads it spawned into one ATIF document:
 * subagents are embedded flat in `subagent_trajectories` (even when nested)
 * and referenced from the tool call that spawned them.
 */
export const convertCodexSession = (
  input: CodexSessionInput,
  converterVersion: string,
): ConvertedCodexSession => {
  const { sessionId } = input;
  const main = convertCodexThread({
    files: input.root,
    sessionId,
    trajectoryId: null,
    extra: {},
  });
  const subagents = input.subagents.map((subagent) =>
    convertSubagent(sessionId, subagent.threadId, subagent.files),
  );
  const all = [main, ...subagents.map(({ converted }) => converted)];
  const subagentTrajectories = subagents.map(
    ({ converted }) => converted.trajectory,
  );
  const allTrajectories = [main.trajectory, ...subagentTrajectories];
  linkSubagents(all, subagents, allTrajectories, sessionId);

  const totals = all.map((c) => c.totals).reduce(addTokenTotals);
  const { meta } = main.metadata;
  const title =
    input.threadName ?? titleFromPrompt(firstPrompt(main.trajectory));
  const gitBranch =
    main.metadata.gitBranches.at(-1) ??
    input.readFallbackGitBranch(main.metadata.cwd);
  const root: AtifTrajectory = {
    ...main.trajectory,
    notes:
      `Converted from Codex rollout files by meticulous-agent-traces ${converterVersion}. ` +
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
      },
    },
    extra: {
      ...main.trajectory.extra,
      cwd: main.metadata.cwd,
      gitBranch,
      title,
      originator: meta?.originator ?? null,
      source: meta?.source ?? null,
      ...(meta?.forkedFromId ? { forked_from_id: meta.forkedFromId } : {}),
    },
    ...(subagentTrajectories.length > 0
      ? { subagent_trajectories: subagentTrajectories }
      : {}),
  };
  return {
    trajectory: root,
    stats: buildSessionStats({
      main: main.metadata,
      all: all.map((c) => c.metadata),
      gitBranch,
      title,
      models: countModels(allTrajectories).map(([model]) => model),
      stepCount: main.trajectory.steps.length,
      subagentCount: subagents.length,
      totals,
      activity: computeActivityStats(root, allTrajectories),
    }),
  };
};

const convertSubagent = (
  sessionId: string,
  threadId: string,
  files: RolloutFileText[],
) => {
  const trajectoryId = `agent-${threadId}`;
  const converted = convertCodexThread({
    files,
    sessionId,
    trajectoryId,
    extra: {},
  });
  const meta = converted.metadata.meta;
  converted.trajectory.extra = {
    ...converted.trajectory.extra,
    agent_id: threadId,
    agent_nickname: meta?.agentNickname ?? null,
    agent_role: meta?.agentRole ?? null,
    agent_path: meta?.agentPath ?? null,
    parent_thread_id: meta?.parentThreadId ?? null,
    spawn_depth: meta?.spawnDepth ?? null,
    source: meta?.source ?? null,
  };
  return { threadId, trajectoryId, converted };
};

const linkSubagents = (
  all: ConvertedCodexThread[],
  subagents: Array<ReturnType<typeof convertSubagent>>,
  allTrajectories: AtifTrajectory[],
  sessionId: string,
): void => {
  const spawnCallIds = new Map(all.flatMap((c) => [...c.spawnCallIds]));
  for (const { threadId, trajectoryId, converted } of subagents) {
    const callId = spawnCallIds.get(threadId);
    const meta = converted.metadata.meta;
    if (callId) {
      linkSubagentToToolCall(allTrajectories, callId, {
        trajectory_id: trajectoryId,
        session_id: sessionId,
        extra: {
          agent_nickname: meta?.agentNickname ?? null,
          agent_role: meta?.agentRole ?? null,
        },
      });
    }
  }
};

const firstPrompt = (trajectory: AtifTrajectory): string | null => {
  const step = trajectory.steps.find(
    (candidate) =>
      candidate.source === "user" &&
      !candidate.is_copied_context &&
      candidate.extra?.["origin_kind"] === undefined &&
      candidate.extra?.["is_compact_summary"] !== true,
  );
  return typeof step?.message === "string" ? step.message : null;
};
