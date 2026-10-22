import { basename } from "path";

export const CLAUDE_CODE_SUBAGENT_JSONL_REGEX =
  /^agent-([A-Za-z0-9_-]+)\.jsonl$/;
export const CLAUDE_CODE_SUBAGENT_META_REGEX =
  /^agent-([A-Za-z0-9_-]+)\.meta\.json$/;

export const isClaudeCodeSubagentMetaName = (path: string): boolean =>
  CLAUDE_CODE_SUBAGENT_META_REGEX.test(basename(path));

export const claudeCodeSubagentMetaName = (agentId: string): string =>
  `agent-${agentId}.meta.json`;
