import type { AtifTrajectory } from "../types/atif.types";
import { ATIF_SCHEMA_VERSION } from "../types/atif.types";
import { computeActivityStats } from "../atif/activity-stats";
import type { SessionStats } from "../atif/session-stats.types";
import { titleFromPrompt } from "../atif/title-from-prompt";
import { countModels, sumStepTokens } from "../atif/token-totals";
import { buildPiSteps } from "./build-pi-steps";
import { collectPiMetadata } from "./collect-pi-metadata";
import type { ParsedPiSession } from "./pi-entry.types";
import { selectActiveBranch } from "./select-active-branch";

const PI_AGENT_NAME = "pi";

export interface PiSessionInput {
  sessionId: string;
  parsed: ParsedPiSession;
  gitBranch: string | null;
}

interface ConvertedPiSession {
  trajectory: AtifTrajectory;
  stats: SessionStats;
}

/**
 * Converts the active branch of a Pi session. Branches the user navigated
 * away from stay in the raw upload but not the ATIF; Pi has no built-in
 * subagents, so there are no subagent trajectories.
 */
export const convertPiSession = (
  { sessionId, parsed, gitBranch }: PiSessionInput,
  converterVersion: string,
): ConvertedPiSession => {
  const metadata = collectPiMetadata(parsed);
  const branch = selectActiveBranch(parsed.entries);
  const { steps, unconvertedTypes } = buildPiSteps(branch.path);
  const totals = sumStepTokens(steps);
  const firstPrompt = steps.find(
    (step) =>
      step.source === "user" && step.extra?.["origin_kind"] === undefined,
  );
  const title =
    metadata.name ??
    titleFromPrompt(
      typeof firstPrompt?.message === "string" ? firstPrompt.message : null,
    );
  const header = parsed.header;

  const trajectory: AtifTrajectory = {
    schema_version: ATIF_SCHEMA_VERSION,
    session_id: sessionId,
    agent: { name: PI_AGENT_NAME, version: "unknown" },
    steps,
    notes:
      `Converted from a Pi session file by meticulous-agent-traces ${converterVersion}. ` +
      "Only the active branch is converted; abandoned branches remain in the raw upload. " +
      "Token totals cover assistant messages on the active branch, while " +
      "pi_reported_cost_usd mirrors Pi's own session stats (every branch, plus " +
      "compaction, branch-summary and tool usage). Pi does not record its version.",
    final_metrics: {
      total_prompt_tokens: totals.promptTokens,
      total_completion_tokens: totals.completionTokens,
      total_cached_tokens: totals.cachedTokens,
      total_steps: steps.length,
      extra: {
        total_cache_creation_tokens: totals.cacheCreationTokens,
        ...(metadata.reportedCostUsd !== null
          ? { pi_reported_cost_usd: metadata.reportedCostUsd }
          : {}),
      },
    },
    extra: {
      cwd: metadata.cwd,
      gitBranch,
      title,
      pi_session_version: header?.version ?? null,
      ...(header?.id && header.id !== sessionId
        ? { header_session_id: header.id }
        : {}),
      ...(header?.parentSession
        ? { parent_session: header.parentSession }
        : {}),
      abandoned_entry_count: branch.abandonedEntryCount,
      abandoned_branch_count: branch.abandonedBranchCount,
      ...(unconvertedTypes.length > 0
        ? { unconverted_entry_types: unconvertedTypes }
        : {}),
      ...(parsed.malformedLineCount > 0
        ? { malformed_line_count: parsed.malformedLineCount }
        : {}),
    },
  };
  const models = countModels([trajectory]).map(([model]) => model);
  if (models[0]) {
    trajectory.agent.model_name = models[0];
  }

  return {
    trajectory,
    stats: {
      cwd: metadata.cwd,
      gitBranch,
      gitBranches: gitBranch ? [gitBranch] : [],
      pullRequests: [],
      agentVersion: null,
      entrypoint: null,
      permissionModes: [],
      title,
      models,
      startedAt: metadata.startedAt,
      endedAt: metadata.endedAt,
      stepCount: steps.length,
      subagentCount: 0,
      totals,
      reportedCostUsd: metadata.reportedCostUsd,
      activity: computeActivityStats(trajectory, [trajectory]),
    },
  };
};
