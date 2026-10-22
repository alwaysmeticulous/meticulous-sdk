import type { AgentTraceAgent } from "./constants";

/**
 * The agent's own transcript files for one session, uploaded verbatim
 * alongside the ATIF conversion so it can be re-derived as the converter
 * improves.
 */
export interface AgentTraceRawEnvelope {
  envelopeVersion: 1;
  agent: AgentTraceAgent;
  sessionId: string;
  /**
   * Name of the agent's per-project directory the session was found in, or
   * null for agents that don't keep one (e.g. Devin, OpenCode).
   */
  projectDirName: string | null;
  /**
   * `atif` when `files` are ATIF trajectories rather than the agent's own
   * transcripts, e.g. traces exported from another tool. Absent means native.
   */
  rawFormat?: "atif";
  files: AgentTraceRawFile[];
}

export interface AgentTraceRawFile {
  /**
   * Relative to the agent's session root, e.g. for Claude Code the project
   * directory (`<id>/subagents/agent-x.jsonl`), for spooled hook events the
   * session's spool directory. Cursor mixes both: transcripts relative to
   * `~/.cursor/projects` (or `transcript/<name>` when found elsewhere) and
   * events as `hook-events/<name>`. Agents whose sessions live in a database
   * (OpenCode) carry one synthesised export file instead.
   */
  relativePath: string;
  mtimeMs: number;
  sizeBytes: number;
  /** UTF-8 file contents. */
  content: string;
}
