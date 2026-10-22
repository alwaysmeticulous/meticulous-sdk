import { basename, dirname } from "path";
import { CLAUDE_CODE_SUBAGENT_JSONL_REGEX } from "../../detect/claude-code-file-names";
import { fileStem, isValidSessionId } from "../../session-id";
import type { DetectedTraceFileOf } from "../../trace-files.types";

export type ClaudeCodeFile = DetectedTraceFileOf<"claude-code">;

export type ClaudeCodeFileRole =
  | { kind: "main"; sessionId: string }
  | { kind: "subagent"; parentSessionId: string | null; agentId: string }
  | { kind: "unidentified" };

/**
 * A subagent is `<sessionId>/subagents/agent-<agentId>.jsonl`, or a
 * sidechain transcript elsewhere. A main transcript is named after its
 * session, or else says which session it is.
 */
export const classifyClaudeCodeFile = (
  file: ClaudeCodeFile,
): ClaudeCodeFileRole => {
  const subagentDir = dirname(file.path);
  const pathAgentId = CLAUDE_CODE_SUBAGENT_JSONL_REGEX.exec(
    basename(file.path),
  )?.[1];
  if (pathAgentId && basename(subagentDir) === "subagents") {
    const parentSessionId = basename(dirname(subagentDir));
    return {
      kind: "subagent",
      parentSessionId: isValidSessionId(parentSessionId)
        ? parentSessionId
        : file.sessionId,
      agentId: pathAgentId,
    };
  }
  if (file.isSidechain && file.agentId) {
    return {
      kind: "subagent",
      parentSessionId: file.sessionId,
      agentId: file.agentId,
    };
  }
  const stem = fileStem(file.path);
  const sessionId = isValidSessionId(stem)
    ? stem
    : isValidSessionId(file.sessionId)
      ? file.sessionId
      : null;
  return sessionId ? { kind: "main", sessionId } : { kind: "unidentified" };
};
