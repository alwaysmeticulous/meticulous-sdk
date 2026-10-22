import type { AtifTrajectory } from "../types/atif.types";
import { ATIF_SCHEMA_VERSION } from "../types/atif.types";
import { computeActivityStats } from "../atif/activity-stats";
import type { SessionStats } from "../atif/session-stats.types";
import { buildDevinSteps } from "./build-devin-steps";
import type { DevinSessionMetadata } from "./collect-devin-metadata";
import type { TimedSpooledEvent } from "../hook-events/spooled-event.types";

const DEVIN_AGENT_NAME = "devin";

export interface DevinSessionInput {
  sessionId: string;
  events: TimedSpooledEvent[];
  metadata: DevinSessionMetadata;
  gitBranch: string | null;
}

interface ConvertedDevinSession {
  trajectory: AtifTrajectory;
  stats: SessionStats;
}

export const convertDevinSession = (
  { sessionId, events, metadata, gitBranch }: DevinSessionInput,
  converterVersion: string,
): ConvertedDevinSession => {
  const steps = buildDevinSteps(events);
  const trajectory: AtifTrajectory = {
    schema_version: ATIF_SCHEMA_VERSION,
    session_id: sessionId,
    agent: { name: DEVIN_AGENT_NAME, version: "unknown" },
    steps,
    notes:
      `Rebuilt from Devin lifecycle hook events by meticulous-agent-traces ${converterVersion}. ` +
      "Devin's hooks expose prompts, tool calls and each turn's final message, " +
      "but not the model, token usage or intermediate assistant messages.",
    final_metrics: { total_steps: steps.length },
    extra: {
      cwd: metadata.cwd,
      gitBranch,
      title: metadata.title,
      session_start_source: metadata.startSource,
      session_end_reason: metadata.endReason,
      ...(metadata.malformedEventCount > 0
        ? { malformed_event_count: metadata.malformedEventCount }
        : {}),
    },
  };
  return {
    trajectory,
    stats: {
      cwd: metadata.cwd,
      gitBranch,
      gitBranches: gitBranch ? [gitBranch] : [],
      pullRequests: [],
      agentVersion: null,
      entrypoint: metadata.startSource,
      permissionModes: [],
      title: metadata.title,
      models: [],
      startedAt: metadata.startedAt,
      endedAt: metadata.endedAt,
      stepCount: steps.length,
      subagentCount: 0,
      totals: {
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        cacheCreationTokens: 0,
      },
      reportedCostUsd: null,
      activity: computeActivityStats(trajectory, [trajectory]),
    },
  };
};
