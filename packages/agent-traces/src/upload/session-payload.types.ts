import type { AgentTraceRawEnvelope } from "../types/raw-envelope.types";
import type { AtifTrajectory } from "../types/atif.types";
import type { SessionStats } from "../atif/session-stats.types";

/** What each agent's converter produces from one session's files. */
export interface SessionPayload {
  envelope: AgentTraceRawEnvelope;
  trajectory: AtifTrajectory;
  stats: SessionStats;
}
