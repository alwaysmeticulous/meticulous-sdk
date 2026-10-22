import type { AtifExtra, AtifTrajectory } from "../types/atif.types";
import { buildLeafTrajectory } from "../atif/build-leaf-trajectory";
import type { TokenTotals } from "../atif/token-totals";
import { sumStepTokens } from "../atif/token-totals";
import { buildCodexSteps } from "./build-codex-steps";
import type { RolloutFileText } from "./parse-thread";
import { parseThread } from "./parse-thread";
import type { CodexThreadMetadata } from "./thread-metadata";

const CODEX_AGENT_NAME = "codex";

export interface ConvertedCodexThread {
  trajectory: AtifTrajectory;
  metadata: CodexThreadMetadata;
  /** This thread's own steps only. */
  totals: TokenTotals;
  /** Spawned thread id → the tool call that spawned it. */
  spawnCallIds: Map<string, string>;
}

interface ConvertThreadOptions {
  files: RolloutFileText[];
  sessionId: string;
  trajectoryId: string | null;
  extra: AtifExtra;
}

/** Converts one thread's rollout files, without resolving any subagents. */
export const convertCodexThread = ({
  files,
  sessionId,
  trajectoryId,
  extra,
}: ConvertThreadOptions): ConvertedCodexThread => {
  const { entries, metadata, events } = parseThread(files);
  const steps = buildCodexSteps(entries, events);
  const totals = sumStepTokens(steps);
  const trajectory = buildLeafTrajectory({
    sessionId,
    trajectoryId,
    agentName: CODEX_AGENT_NAME,
    agentVersion: metadata.cliVersion ?? "unknown",
    steps,
    totals,
    extra: {
      ...extra,
      ...(metadata.malformedLineCount > 0
        ? { malformed_line_count: metadata.malformedLineCount }
        : {}),
    },
  });
  return { trajectory, metadata, totals, spawnCallIds: events.spawnCallIds };
};
