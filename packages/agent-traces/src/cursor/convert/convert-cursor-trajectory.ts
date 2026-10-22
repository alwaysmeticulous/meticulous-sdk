import type { AtifExtra, AtifTrajectory } from "../../types/atif.types";
import { buildLeafTrajectory } from "../../atif/build-leaf-trajectory";
import type { TokenTotals } from "../../atif/token-totals";
import { sumStepTokens } from "../../atif/token-totals";
import type { CursorHookEvent } from "../events/cursor-hook-event.types";
import { buildCursorTimeline } from "../merge/build-cursor-timeline";
import { buildCursorSteps } from "../steps/build-cursor-steps";
import type { ParsedCursorTranscript } from "../transcript/cursor-transcript.types";

const CURSOR_AGENT_NAME = "cursor";

interface CursorTrajectoryInput {
  sessionId: string;
  trajectoryId: string | null;
  transcript: ParsedCursorTranscript | null;
  /** This trajectory's own events, in the order they were written. */
  events: CursorHookEvent[];
  agentVersion: string | null;
  extra: AtifExtra;
}

export interface ConvertedCursorTrajectory {
  trajectory: AtifTrajectory;
  /** This trajectory's own steps only. */
  totals: TokenTotals;
}

/** Converts one conversation (the root or a subagent), without linking subagents. */
export const convertCursorTrajectory = ({
  sessionId,
  trajectoryId,
  transcript,
  events,
  agentVersion,
  extra,
}: CursorTrajectoryInput): ConvertedCursorTrajectory => {
  const steps = buildCursorSteps(
    buildCursorTimeline(transcript?.entries ?? [], events),
  );
  const totals = sumStepTokens(steps);
  const trajectory = buildLeafTrajectory({
    sessionId,
    trajectoryId,
    agentName: CURSOR_AGENT_NAME,
    agentVersion: agentVersion ?? "unknown",
    steps,
    totals,
    extra: {
      ...extra,
      ...(transcript?.overview ? { overview: transcript.overview } : {}),
      ...(transcript && transcript.malformedLineCount > 0
        ? { malformed_line_count: transcript.malformedLineCount }
        : {}),
    },
  });
  return { trajectory, totals };
};
