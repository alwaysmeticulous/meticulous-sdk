import type { AtifExtra, AtifTrajectory } from "../types/atif.types";
import { buildLeafTrajectory } from "../atif/build-leaf-trajectory";
import type { TokenTotals } from "../atif/token-totals";
import { sumStepTokens } from "../atif/token-totals";
import { buildSteps } from "./build-steps";
import { parseTranscript } from "./parse-transcript";
import type { TranscriptMetadata } from "./transcript.types";

const CLAUDE_CODE_AGENT_NAME = "claude-code";

export interface ConvertedTranscript {
  trajectory: AtifTrajectory;
  metadata: TranscriptMetadata;
  /** This transcript's own steps only. */
  totals: TokenTotals;
}

interface ConvertTranscriptOptions {
  text: string;
  sessionId: string;
  trajectoryId: string | null;
  extra: AtifExtra;
}

/** Converts a single JSONL file, without resolving any subagents. */
export const convertTranscript = ({
  text,
  sessionId,
  trajectoryId,
  extra,
}: ConvertTranscriptOptions): ConvertedTranscript => {
  const { entries, metadata } = parseTranscript(text);
  const steps = buildSteps(entries);
  const totals = sumStepTokens(steps);
  const trajectory = buildLeafTrajectory({
    sessionId,
    trajectoryId,
    agentName: CLAUDE_CODE_AGENT_NAME,
    agentVersion: metadata.version ?? "unknown",
    steps,
    totals,
    extra: {
      ...extra,
      ...(metadata.malformedLineCount > 0
        ? { malformed_line_count: metadata.malformedLineCount }
        : {}),
    },
  });
  return { trajectory, metadata, totals };
};
