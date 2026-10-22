import { readdir } from "fs/promises";
import { basename, dirname, join } from "path";
import { statTraceFile } from "../../collect/stat-trace-file";
import {
  CLAUDE_CODE_SUBAGENT_JSONL_REGEX,
  claudeCodeSubagentMetaName,
} from "../../detect/claude-code-file-names";
import { fileStem } from "../../session-id";
import type { TraceFile } from "../../trace-files.types";

export interface ClaudeCodeSubagentFiles {
  agentId: string;
  jsonl: TraceFile;
  meta: TraceFile | null;
}

/** `<sessionId>/subagents/agent-<id>.{jsonl,meta.json}` beside the main transcript. */
export const findClaudeCodeSubagentsOnDisk = async (
  mainPath: string,
): Promise<ClaudeCodeSubagentFiles[]> => {
  const dir = join(dirname(mainPath), fileStem(mainPath), "subagents");
  let names: string[];
  try {
    names = (await readdir(dir)).sort();
  } catch {
    return [];
  }
  const subagents: ClaudeCodeSubagentFiles[] = [];
  for (const name of names) {
    const agentId = CLAUDE_CODE_SUBAGENT_JSONL_REGEX.exec(name)?.[1];
    const jsonl = agentId ? await statTraceFile(join(dir, name)) : null;
    if (agentId && jsonl) {
      subagents.push({
        agentId,
        jsonl,
        meta: await findSubagentMeta(jsonl.path, agentId),
      });
    }
  }
  return subagents;
};

/** The `agent-<id>.meta.json` Claude Code writes next to a subagent's transcript. */
export const findSubagentMeta = async (
  jsonlPath: string,
  agentId: string,
): Promise<TraceFile | null> =>
  basename(jsonlPath) === `agent-${agentId}.jsonl`
    ? statTraceFile(
        join(dirname(jsonlPath), claudeCodeSubagentMetaName(agentId)),
      )
    : null;
