import type { AtifTrajectory } from "../../types/atif.types";
import { computeActivityStats } from "../../atif/activity-stats";
import type { SessionStats } from "../../atif/session-stats.types";
import { titleFromPrompt } from "../../atif/title-from-prompt";
import { addTokenTotals, countModels } from "../../atif/token-totals";
import type { CursorHookEvent } from "../events/cursor-hook-event.types";
import type { ParsedCursorTranscript } from "../transcript/cursor-transcript.types";
import type { CursorSessionMetadata } from "./collect-cursor-metadata";
import type { CursorSubagentSource } from "./convert-cursor-subagents";
import { convertCursorSubagents } from "./convert-cursor-subagents";
import { convertCursorTrajectory } from "./convert-cursor-trajectory";
import { linkCursorSubagents } from "./link-cursor-subagents";

export interface CursorSessionInput {
  sessionId: string;
  transcript: ParsedCursorTranscript | null;
  /** The root conversation's spooled events, in the order they were written. */
  events: CursorHookEvent[];
  subagents: CursorSubagentSource[];
  metadata: CursorSessionMetadata;
  gitBranch: string | null;
  malformedEventCount: number;
}

interface ConvertedCursorSession {
  trajectory: AtifTrajectory;
  stats: SessionStats;
}

/**
 * Converts a conversation and its subagents into one ATIF document, merging
 * each one's transcript with its hook events. Subagents are embedded flat in
 * `subagent_trajectories` and referenced from the tool call that spawned them.
 */
export const convertCursorSession = (
  input: CursorSessionInput,
  converterVersion: string,
): ConvertedCursorSession => {
  const { sessionId, metadata, gitBranch } = input;
  const { rootOwnEvents, converted: subagents } = convertCursorSubagents({
    sessionId,
    rootEvents: input.events,
    subagents: input.subagents,
    agentVersion: metadata.agentVersion,
  });
  const main = convertCursorTrajectory({
    sessionId,
    trajectoryId: null,
    transcript: input.transcript,
    events: rootOwnEvents,
    agentVersion: metadata.agentVersion,
    extra: {},
  });
  linkCursorSubagents(sessionId, main.trajectory, subagents);

  const subagentTrajectories = subagents.map(
    ({ converted }) => converted.trajectory,
  );
  const allTrajectories = [main.trajectory, ...subagentTrajectories];
  const totals = [main, ...subagents.map(({ converted }) => converted)]
    .map((converted) => converted.totals)
    .reduce(addTokenTotals);
  const firstPrompt = main.trajectory.steps.find(
    (step) =>
      step.source === "user" && step.extra?.["is_compact_summary"] !== true,
  );
  const title = titleFromPrompt(
    typeof firstPrompt?.message === "string" ? firstPrompt.message : null,
  );
  const root: AtifTrajectory = {
    ...main.trajectory,
    notes:
      `Converted from Cursor agent transcripts and hook events by meticulous-agent-traces ${converterVersion}. ` +
      "Transcripts hold messages and tool calls without timestamps, tool results or usage; hook events, " +
      "where installed, add those (usage per generation, on its last agent step) and are matched to " +
      "transcript entries by prompt text and tool order. final_metrics totals include every embedded " +
      "subagent trajectory; total_steps counts root steps only.",
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
      cwd: metadata.cwd,
      gitBranch,
      title,
      composer_modes: metadata.composerModes,
      has_transcript: input.transcript !== null,
      hook_event_count: input.events.length,
      ...(metadata.isBackgroundAgent ? { is_background_agent: true } : {}),
      ...(input.malformedEventCount > 0
        ? { malformed_event_count: input.malformedEventCount }
        : {}),
    },
    ...(subagentTrajectories.length > 0
      ? { subagent_trajectories: subagentTrajectories }
      : {}),
  };
  return {
    trajectory: root,
    stats: {
      cwd: metadata.cwd,
      gitBranch,
      gitBranches: gitBranch ? [gitBranch] : [],
      pullRequests: [],
      agentVersion: metadata.agentVersion,
      entrypoint: metadata.isBackgroundAgent ? "background-agent" : null,
      permissionModes: metadata.composerModes,
      title,
      models: countModels(allTrajectories).map(([model]) => model),
      startedAt: metadata.startedAt,
      endedAt: metadata.endedAt,
      stepCount: main.trajectory.steps.length,
      subagentCount: subagents.length,
      totals,
      reportedCostUsd: null,
      activity: computeActivityStats(root, allTrajectories),
    },
  };
};
