import type { JsonRecord } from "../utils/json-guards";
import {
  asNonEmptyString,
  asNumber,
  asRecord,
  asString,
} from "../utils/json-guards";

/** The parts of a rollout's `session_meta` line the uploader uses. */
export interface CodexSessionMeta {
  threadId: string | null;
  /** The root thread's id; absent from older rollouts. */
  sessionId: string | null;
  parentThreadId: string | null;
  forkedFromId: string | null;
  cwd: string | null;
  /** e.g. `codex_cli_rs`, `codex_exec`, `codex_vscode`. */
  originator: string | null;
  cliVersion: string | null;
  /** e.g. `cli`, `exec`, `vscode`, `subagent_thread_spawn`. */
  source: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  agentPath: string | null;
  spawnDepth: number | null;
  gitBranch: string | null;
  /** The rollout whose prefix this file continues, with its exclusive end. */
  historyBase: { rolloutId: string; endOrdinalExclusive: number } | null;
  /** Earlier ordinals are history a subagent inherited from its parent. */
  subagentHistoryStartOrdinal: number | null;
}

export const parseSessionMeta = (payload: JsonRecord): CodexSessionMeta => {
  const source = payload["source"];
  const threadSpawn = asRecord(
    asRecord(asRecord(source)?.["subagent"])?.["thread_spawn"],
  );
  const historyBase = asRecord(payload["history_base"]);
  const baseRolloutId = asNonEmptyString(historyBase?.["thread_id"]);
  const baseEnd = asNumber(historyBase?.["end_ordinal_exclusive"]);
  return {
    threadId: asNonEmptyString(payload["id"]),
    sessionId: asNonEmptyString(payload["session_id"]),
    parentThreadId:
      asNonEmptyString(payload["parent_thread_id"]) ??
      asNonEmptyString(threadSpawn?.["parent_thread_id"]),
    forkedFromId: asNonEmptyString(payload["forked_from_id"]),
    cwd: asNonEmptyString(payload["cwd"]),
    originator: asNonEmptyString(payload["originator"]),
    cliVersion: asNonEmptyString(payload["cli_version"]),
    source: describeSource(source),
    agentNickname:
      asNonEmptyString(payload["agent_nickname"]) ??
      asNonEmptyString(threadSpawn?.["agent_nickname"]),
    agentRole:
      asNonEmptyString(payload["agent_role"]) ??
      asNonEmptyString(threadSpawn?.["agent_role"]),
    agentPath:
      asNonEmptyString(payload["agent_path"]) ??
      asNonEmptyString(threadSpawn?.["agent_path"]),
    spawnDepth: asNumber(threadSpawn?.["depth"]),
    gitBranch: asNonEmptyString(asRecord(payload["git"])?.["branch"]),
    historyBase:
      baseRolloutId && baseEnd !== null
        ? { rolloutId: baseRolloutId, endOrdinalExclusive: baseEnd }
        : null,
    subagentHistoryStartOrdinal: asNumber(
      payload["subagent_history_start_ordinal"],
    ),
  };
};

/** Flattens serde's externally tagged `SessionSource`, as Codex's own `Display` does. */
const describeSource = (source: unknown): string | null => {
  const asText = asNonEmptyString(source);
  if (asText) {
    return asText;
  }
  const [variant, value] = Object.entries(asRecord(source) ?? {})[0] ?? [];
  if (!variant) {
    return null;
  }
  const detail = asString(value) ?? Object.keys(asRecord(value) ?? {})[0];
  return detail ? `${variant}_${detail}` : variant;
};
