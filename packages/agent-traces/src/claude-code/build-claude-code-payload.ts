import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import type { SessionPayload } from "../upload/session-payload.types";
import { convertClaudeCodeSession } from "./convert-session";

export interface ClaudeCodePayloadFiles {
  sessionId: string;
  projectDirName: string;
  main: AgentTraceRawFile;
  subagents: Array<{
    agentId: string;
    jsonl: AgentTraceRawFile;
    meta: AgentTraceRawFile | null;
  }>;
}

export const buildClaudeCodePayload = (
  { sessionId, projectDirName, main, subagents }: ClaudeCodePayloadFiles,
  converterVersion: string,
): SessionPayload => {
  const { trajectory, stats } = convertClaudeCodeSession(
    {
      sessionId,
      mainText: main.content,
      subagents: subagents.map(({ agentId, jsonl, meta }) => ({
        agentId,
        text: jsonl.content,
        metaText: meta?.content ?? null,
      })),
    },
    converterVersion,
  );
  return {
    envelope: {
      envelopeVersion: 1,
      agent: "claude-code",
      sessionId,
      projectDirName,
      files: [
        main,
        ...subagents.flatMap(({ jsonl, meta }) =>
          meta ? [jsonl, meta] : [jsonl],
        ),
      ],
    },
    trajectory,
    stats,
  };
};
