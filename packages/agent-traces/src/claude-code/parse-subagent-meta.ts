import { asNonEmptyString, asNumber, asRecord } from "../utils/json-guards";

/** Contents of Claude Code's `agent-<id>.meta.json`. */
interface SubagentMeta {
  agentType: string | null;
  description: string | null;
  /** The parent's `Agent`/`Task` tool call that spawned this subagent. */
  toolUseId: string | null;
  spawnDepth: number | null;
}

export const parseSubagentMeta = (text: string | null): SubagentMeta => {
  let record: Record<string, unknown> | null = null;
  try {
    record = text ? asRecord(JSON.parse(text)) : null;
  } catch {
    record = null;
  }
  return {
    agentType: asNonEmptyString(record?.["agentType"]),
    description: asNonEmptyString(record?.["description"]),
    toolUseId: asNonEmptyString(record?.["toolUseId"]),
    spawnDepth: asNumber(record?.["spawnDepth"]),
  };
};
