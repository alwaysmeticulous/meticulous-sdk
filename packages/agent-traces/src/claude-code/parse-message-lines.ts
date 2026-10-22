import type { JsonRecord } from "../utils/json-guards";
import {
  asArray,
  asNonEmptyString,
  asNumber,
  asRecord,
  asString,
} from "../utils/json-guards";
import { flattenToolResultContent } from "./tool-result-content";
import type {
  AssistantBlock,
  AssistantEntry,
  TranscriptUsage,
  UserBlock,
  UserEntry,
} from "./transcript.types";
import { IMAGE_PLACEHOLDER } from "./transcript.types";

export const parseAssistantLine = (line: JsonRecord): AssistantEntry | null => {
  const message = asRecord(line["message"]);
  if (!message) {
    return null;
  }
  return {
    kind: "assistant",
    timestamp: asNonEmptyString(line["timestamp"]),
    messageId: asNonEmptyString(message["id"]),
    model: asNonEmptyString(message["model"]),
    stopReason: asNonEmptyString(message["stop_reason"]),
    requestId: asNonEmptyString(line["requestId"]),
    blocks: (asArray(message["content"]) ?? []).flatMap(parseAssistantBlock),
    usage: parseUsage(message["usage"]),
  };
};

export const parseUserLine = (line: JsonRecord): UserEntry | null => {
  const message = asRecord(line["message"]);
  if (!message) {
    return null;
  }
  const content = message["content"];
  const blocks: UserBlock[] =
    typeof content === "string"
      ? [{ type: "text", text: content }]
      : (asArray(content) ?? []).flatMap(parseUserBlock);
  return {
    kind: "user",
    uuid: asNonEmptyString(line["uuid"]),
    timestamp: asNonEmptyString(line["timestamp"]),
    isMeta: line["isMeta"] === true,
    isCompactSummary: line["isCompactSummary"] === true,
    originKind: injectedOriginKind(asRecord(line["origin"])?.["kind"]),
    blocks,
  };
};

/** Claude Code marks prompts the user typed `human`; any other origin was injected. */
const injectedOriginKind = (value: unknown): string | null => {
  const kind = asNonEmptyString(value);
  return kind === "human" ? null : kind;
};

const parseAssistantBlock = (value: unknown): AssistantBlock[] => {
  const block = asRecord(value);
  const type = asString(block?.["type"]);
  if (!block || !type) {
    return [];
  }
  switch (type) {
    case "text":
      return [{ type: "text", text: asString(block["text"]) ?? "" }];
    case "thinking":
      return [
        { type: "thinking", thinking: asString(block["thinking"]) ?? "" },
      ];
    case "tool_use": {
      const id = asNonEmptyString(block["id"]);
      if (!id) {
        return [];
      }
      return [
        {
          type: "tool_use",
          id,
          name: asString(block["name"]) ?? "unknown",
          input: asRecord(block["input"]) ?? {},
        },
      ];
    }
    default:
      return [{ type: "other", originalType: type }];
  }
};

const parseUserBlock = (value: unknown): UserBlock[] => {
  const block = asRecord(value);
  const type = asString(block?.["type"]);
  if (!block || !type) {
    return [];
  }
  switch (type) {
    case "text":
      return [{ type: "text", text: asString(block["text"]) ?? "" }];
    case "image":
      return [{ type: "text", text: IMAGE_PLACEHOLDER }];
    case "tool_result": {
      const toolUseId = asNonEmptyString(block["tool_use_id"]);
      if (!toolUseId) {
        return [];
      }
      return [
        {
          type: "tool_result",
          toolUseId,
          content: flattenToolResultContent(block["content"]),
          isError: block["is_error"] === true,
        },
      ];
    }
    default:
      return [{ type: "other", originalType: type }];
  }
};

const parseUsage = (value: unknown): TranscriptUsage | null => {
  const usage = asRecord(value);
  if (!usage) {
    return null;
  }
  return {
    inputTokens: asNumber(usage["input_tokens"]) ?? 0,
    outputTokens: asNumber(usage["output_tokens"]) ?? 0,
    cacheCreationInputTokens:
      asNumber(usage["cache_creation_input_tokens"]) ?? 0,
    cacheReadInputTokens: asNumber(usage["cache_read_input_tokens"]) ?? 0,
    thinkingTokens: asNumber(
      asRecord(usage["output_tokens_details"])?.["thinking_tokens"],
    ),
    serviceTier: asNonEmptyString(usage["service_tier"]),
    cacheCreation: asRecord(usage["cache_creation"]),
  };
};
