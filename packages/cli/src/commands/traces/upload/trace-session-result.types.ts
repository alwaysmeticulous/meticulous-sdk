import type { AgentTraceAgent } from "@alwaysmeticulous/agent-traces";

export type TraceSessionOutcome =
  | { kind: "uploaded"; agentTraceId: string }
  | { kind: "already-uploaded"; agentTraceId: string }
  | { kind: "converted"; outputDir: string | null }
  | { kind: "failed"; reason: string };

export interface TraceSessionResult {
  agent: AgentTraceAgent;
  sessionId: string;
  sourcePaths: string[];
  /** Null when the session couldn't be converted. */
  stepCount: number | null;
  subagentCount: number | null;
  outcome: TraceSessionOutcome;
}
