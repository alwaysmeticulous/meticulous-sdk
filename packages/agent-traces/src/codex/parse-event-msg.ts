import type { JsonRecord } from "../utils/json-guards";
import {
  asArray,
  asNonEmptyString,
  asNumber,
  asRecord,
} from "../utils/json-guards";
import type { CodexEntryBody } from "./codex-entry.types";
import { isZeroUsage, parseTokenUsage } from "./parse-token-usage";

/** What `event_msg` lines contribute beyond entries, gathered across a thread. */
export interface EventMsgState {
  /** A `token_usage_record` makes the `token_count` that follows redundant. */
  usageRecordPending: boolean;
  /** `token_count` repeats itself (e.g. on resume); a new response changes the total. */
  lastTokenCountTotal: string | null;
  failedCallIds: Set<string>;
  /** Codex's own timing of shell commands, by `call_id`. */
  durationMsByCallId: Map<string, number>;
  /** Spawned thread id → the `call_id` of the tool call that spawned it. */
  spawnCallIds: Map<string, string>;
  spawnAgentCallIds: Set<string>;
}

const FAILED_STATUSES = new Set(["failed", "declined", "error"]);

export const createEventMsgState = (): EventMsgState => ({
  usageRecordPending: false,
  lastTokenCountTotal: null,
  failedCallIds: new Set(),
  durationMsByCallId: new Map(),
  spawnCallIds: new Map(),
  spawnAgentCallIds: new Set(),
});

export const parseEventMsg = (
  payload: JsonRecord,
  state: EventMsgState,
): CodexEntryBody[] => {
  switch (payload["type"]) {
    case "token_count":
      return parseTokenCount(payload, state);
    case "task_started":
    case "task_complete":
    case "turn_aborted":
      return [{ kind: "turn-boundary" }];
    case "item_completed":
      recordCompletedItem(asRecord(payload["item"]), state);
      return [];
    case "collab_agent_spawn_end":
      recordSpawn(state, payload["new_thread_id"], payload["call_id"]);
      return [];
    case "exec_command_end":
      if ((asNumber(payload["exit_code"]) ?? 0) !== 0) {
        recordFailure(state, payload["call_id"]);
      }
      recordDuration(state, payload["call_id"], payload["duration"]);
      return [];
    case "patch_apply_end":
      if (payload["success"] === false) {
        recordFailure(state, payload["call_id"]);
      }
      return [];
    default:
      return [];
  }
};

/** Older multi-agent rollouts only name a spawned thread in the tool's output. */
export const recordSpawnFromOutput = (
  body: CodexEntryBody,
  state: EventMsgState,
): void => {
  if (body.kind === "tool-call" && body.call.function_name === "spawn_agent") {
    state.spawnAgentCallIds.add(body.call.tool_call_id);
  }
  if (
    body.kind !== "tool-output" ||
    !state.spawnAgentCallIds.has(body.callId)
  ) {
    return;
  }
  const agentId = /"agent_id"\s*:\s*"([^"]+)"/.exec(body.content)?.[1];
  if (agentId && !state.spawnCallIds.has(agentId)) {
    state.spawnCallIds.set(agentId, body.callId);
  }
};

const parseTokenCount = (
  payload: JsonRecord,
  state: EventMsgState,
): CodexEntryBody[] => {
  const info = asRecord(payload["info"]);
  const total = parseTokenUsage(info?.["total_token_usage"]);
  if (!info || !total) {
    return [];
  }
  const totalKey = JSON.stringify(total);
  const isRepeat = totalKey === state.lastTokenCountTotal;
  const supersededByRecord = state.usageRecordPending;
  state.lastTokenCountTotal = totalKey;
  state.usageRecordPending = false;
  const last = parseTokenUsage(info["last_token_usage"]);
  if (isRepeat || supersededByRecord || !last || isZeroUsage(last)) {
    return [];
  }
  return [{ kind: "usage", usage: last, responseId: null }];
};

const recordCompletedItem = (
  item: JsonRecord | null,
  state: EventMsgState,
): void => {
  const callId = asNonEmptyString(item?.["id"]);
  if (!item || !callId) {
    return;
  }
  const status = asNonEmptyString(item["status"]);
  const exitCode = asNumber(item["exit_code"]);
  if (
    (status !== null && FAILED_STATUSES.has(status)) ||
    (exitCode !== null && exitCode !== 0) ||
    item["success"] === false
  ) {
    state.failedCallIds.add(callId);
  }
  if (
    item["type"] === "CollabAgentToolCall" &&
    item["tool"] === "spawn_agent"
  ) {
    for (const threadId of asArray(item["receiver_thread_ids"]) ?? []) {
      recordSpawn(state, threadId, callId);
    }
  }
};

const recordSpawn = (
  state: EventMsgState,
  threadId: unknown,
  callId: unknown,
): void => {
  const thread = asNonEmptyString(threadId);
  const call = asNonEmptyString(callId);
  if (thread && call) {
    state.spawnCallIds.set(thread, call);
  }
};

const recordFailure = (state: EventMsgState, callId: unknown): void => {
  const call = asNonEmptyString(callId);
  if (call) {
    state.failedCallIds.add(call);
  }
};

/** Codex serialises a Rust `Duration` as `{ secs, nanos }`. */
const recordDuration = (
  state: EventMsgState,
  callId: unknown,
  duration: unknown,
): void => {
  const call = asNonEmptyString(callId);
  const record = asRecord(duration);
  const secs = asNumber(record?.["secs"]);
  if (!call || secs === null || secs < 0) {
    return;
  }
  const nanos = asNumber(record?.["nanos"]) ?? 0;
  state.durationMsByCallId.set(call, Math.round(secs * 1000 + nanos / 1e6));
};
