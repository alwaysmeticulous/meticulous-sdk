import type { CodexSessionMeta } from "../codex/parse-session-meta";
import type { AgentTraceAgent } from "../types/constants";
import type { SessionPayload } from "../upload/session-payload.types";
import type { FileTraceAgent } from "./file-trace-agents";

export type { FileTraceAgent };

export interface TraceFile {
  /** Absolute, as found: may go through a symlink. */
  path: string;
  realPath: string;
  /** Named directly rather than found by crawling a directory. */
  explicit: boolean;
  sizeBytes: number;
  mtimeMs: number;
}

export type DetectedTraceFile =
  | (TraceFile & {
      format: "claude-code";
      sessionId: string | null;
      agentId: string | null;
      isSidechain: boolean;
    })
  | (TraceFile & { format: "claude-code-subagent-meta" })
  | (TraceFile & { format: "codex"; meta: CodexSessionMeta | null })
  | (TraceFile & { format: "pi"; headerId: string | null })
  | (TraceFile & { format: "cursor" })
  | (TraceFile & {
      format: "opencode";
      id: string | null;
      parentId: string | null;
    })
  | (TraceFile & {
      format: "atif";
      sessionId: string | null;
      agentName: string | null;
    });

export type TraceFileFormat = DetectedTraceFile["format"];

export type DetectedTraceFileOf<F extends TraceFileFormat> = Extract<
  DetectedTraceFile,
  { format: F }
>;

export interface TraceSession {
  agent: AgentTraceAgent;
  sessionId: string;
  /** Every file the session is read from, including ones found beside those given. */
  sourcePaths: string[];
  /** Reads and converts the files; rejects if they can't be converted. */
  prepare: () => Promise<SessionPayload>;
}

export interface SkippedTracePath {
  path: string;
  reason: string;
}

export interface GroupedTraceSessions {
  sessions: TraceSession[];
  skipped: SkippedTracePath[];
}

export interface GroupContext {
  converterVersion: string;
  agentOverride: FileTraceAgent | null;
}
