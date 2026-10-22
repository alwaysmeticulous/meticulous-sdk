import { basename } from "path";
import { readGitBranch } from "../identity/read-git-branch";
import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import type { SessionPayload } from "../upload/session-payload.types";
import { convertCodexSession } from "./convert-codex-session";
import type { RolloutFileText } from "./parse-thread";
import { parseRolloutFileName } from "./rollout-file-name";

/** A thread's rollout files, oldest first. */
export interface CodexThreadFiles {
  threadId: string;
  files: AgentTraceRawFile[];
}

export interface CodexPayloadFiles {
  sessionId: string;
  root: CodexThreadFiles;
  subagents: CodexThreadFiles[];
  threadName: string | null;
}

export const buildCodexPayload = (
  { sessionId, root, subagents, threadName }: CodexPayloadFiles,
  converterVersion: string,
): SessionPayload => {
  const { trajectory, stats } = convertCodexSession(
    {
      sessionId,
      root: toTexts(root),
      subagents: subagents.map((thread) => ({
        threadId: thread.threadId,
        files: toTexts(thread),
      })),
      threadName,
      readFallbackGitBranch: readGitBranch,
    },
    converterVersion,
  );
  return {
    envelope: {
      envelopeVersion: 1,
      agent: "codex",
      sessionId,
      projectDirName: null,
      files: [root, ...subagents].flatMap((thread) => thread.files),
    },
    trajectory,
    stats,
  };
};

const toTexts = ({ threadId, files }: CodexThreadFiles): RolloutFileText[] =>
  files.map((file) => ({
    rolloutId:
      parseRolloutFileName(basename(file.relativePath))?.rolloutId ?? threadId,
    text: file.content,
  }));
