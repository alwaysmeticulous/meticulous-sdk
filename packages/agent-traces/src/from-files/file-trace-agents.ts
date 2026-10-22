import { AGENT_TRACE_AGENTS, type AgentTraceAgent } from "../types/constants";

/** Devin keeps no transcript files, so its sessions can't be read from files. */
export type FileTraceAgent = Exclude<AgentTraceAgent, "devin">;

export const FILE_TRACE_AGENTS: readonly FileTraceAgent[] =
  AGENT_TRACE_AGENTS.filter(
    (agent): agent is FileTraceAgent => agent !== "devin",
  );
