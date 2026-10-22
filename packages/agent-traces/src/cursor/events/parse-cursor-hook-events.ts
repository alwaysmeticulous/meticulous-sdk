import type { TimedSpooledEvent } from "../../hook-events/spooled-event.types";
import type { JsonRecord } from "../../utils/json-guards";
import {
  asArray,
  asNonEmptyString,
  asNumber,
  asString,
} from "../../utils/json-guards";
import type {
  CursorHookEvent,
  CursorHookEventBase,
  CursorTokenUsage,
} from "./cursor-hook-event.types";

interface ParsedCursorHookEvents {
  events: CursorHookEvent[];
  malformedEventCount: number;
}

/** Events Cursor fires that conversion doesn't use are dropped. */
export const parseCursorHookEvents = (
  timedEvents: TimedSpooledEvent[],
): ParsedCursorHookEvents => {
  const events: CursorHookEvent[] = [];
  let malformedEventCount = 0;
  for (const { event, timestamp } of timedEvents) {
    if (!event?.payload) {
      malformedEventCount++;
      continue;
    }
    const name =
      asNonEmptyString(event.payload["hook_event_name"]) ?? event.event;
    const parsed = toEvent(name, event.payload, timestamp);
    if (parsed) {
      events.push(parsed);
    }
  }
  return { events, malformedEventCount };
};

const toEvent = (
  name: string,
  payload: JsonRecord,
  timestamp: string,
): CursorHookEvent | null => {
  const base: CursorHookEventBase = {
    timestamp,
    generationId: asNonEmptyString(payload["generation_id"]),
    model: asNonEmptyString(payload["model"]),
    parentToolCallId: asNonEmptyString(payload["parent_tool_call_id"]),
  };
  const text = (key: string) => asNonEmptyString(payload[key]);
  switch (name) {
    case "beforeSubmitPrompt": {
      const prompt = asString(payload["prompt"]);
      return prompt === null
        ? null
        : {
            ...base,
            kind: "prompt",
            prompt,
            attachments: asArray(payload["attachments"]) ?? [],
            composerMode: text("composer_mode"),
          };
    }
    case "afterAgentThought":
      return {
        ...base,
        kind: "thought",
        text: asString(payload["text"]) ?? "",
        durationMs: asNumber(payload["duration_ms"]),
      };
    case "afterAgentResponse":
      return {
        ...base,
        kind: "response",
        text: asString(payload["text"]) ?? "",
        usage: readUsage(payload),
      };
    case "postToolUse":
    case "postToolUseFailure": {
      const isError = name === "postToolUseFailure";
      return {
        ...base,
        kind: "tool",
        toolName: text("tool_name") ?? "unknown",
        toolInput: payload["tool_input"] ?? null,
        toolUseId: text("tool_use_id"),
        output: isError
          ? (asString(payload["error_message"]) ?? "")
          : stringify(payload["tool_output"]),
        isError,
        durationMs: asNumber(payload["duration"]),
        failureType: text("failure_type"),
        isInterrupt: payload["is_interrupt"] === true,
        cwd: text("cwd"),
      };
    }
    case "stop":
      return {
        ...base,
        kind: "stop",
        status: text("status"),
        loopCount: asNumber(payload["loop_count"]),
        usage: readUsage(payload),
      };
    case "subagentStart":
      return {
        ...base,
        kind: "subagent_start",
        subagentId: text("subagent_id"),
        toolCallId: text("tool_call_id"),
      };
    case "subagentStop":
      return {
        ...base,
        kind: "subagent_stop",
        subagentId: text("subagent_id"),
        childConversationId: text("child_conversation_id"),
        agentTranscriptPath: text("agent_transcript_path"),
        subagentType: text("subagent_type"),
        status: text("status"),
        task: text("task"),
        description: text("description"),
        summary: text("summary"),
        durationMs: asNumber(payload["duration_ms"]),
      };
    case "preCompact":
      return {
        ...base,
        kind: "compaction",
        trigger: text("trigger"),
        contextTokens: asNumber(payload["context_tokens"]),
      };
    default:
      return null;
  }
};

/** Null unless Cursor reported at least one of the counts. */
const readUsage = (payload: JsonRecord): CursorTokenUsage | null => {
  const counts = [
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
  ].map((key) => asNumber(payload[key]));
  if (counts.every((count) => count === null)) {
    return null;
  }
  const [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens] =
    counts.map((count) => count ?? 0);
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    cacheReadTokens: cacheReadTokens ?? 0,
    cacheWriteTokens: cacheWriteTokens ?? 0,
  };
};

const stringify = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return value === null || value === undefined ? "" : JSON.stringify(value);
};
