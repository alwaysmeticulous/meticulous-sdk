import type { JsonRecord } from "../utils/json-guards";
import {
  asArray,
  asNonEmptyString,
  asNumber,
  asRecord,
  asString,
} from "../utils/json-guards";
import type {
  PiAssistantMessage,
  PiContent,
  PiMessage,
} from "./pi-message.types";
import { parsePiUsage } from "./pi-usage";

/** Null when the entry's `message` isn't an object with a role. */
export const parsePiMessage = (value: unknown): PiMessage | null => {
  const message = asRecord(value);
  const role = asString(message?.["role"]);
  if (!message || role === null) {
    return null;
  }
  switch (role) {
    case "user":
      return { role, ...parseContent(message["content"]) };
    case "assistant":
      return parseAssistant(message);
    case "toolResult":
      return {
        role,
        toolCallId: asNonEmptyString(message["toolCallId"]),
        toolName: asNonEmptyString(message["toolName"]),
        content: parseContent(message["content"]),
        isError: message["isError"] === true,
        usage: parsePiUsage(message["usage"]),
      };
    case "bashExecution":
      return {
        role,
        command: asString(message["command"]) ?? "",
        output: asString(message["output"]) ?? "",
        exitCode: asNumber(message["exitCode"]),
        cancelled: message["cancelled"] === true,
        truncated: message["truncated"] === true,
        fullOutputPath: asNonEmptyString(message["fullOutputPath"]),
        excludeFromContext: message["excludeFromContext"] === true,
      };
    // Version 2 files call extension messages `hookMessage`.
    case "custom":
    case "hookMessage":
      return {
        role: "custom",
        customType: asNonEmptyString(message["customType"]),
        display: message["display"] !== false,
        ...parseContent(message["content"]),
      };
    case "branchSummary":
      return {
        role,
        summary: asString(message["summary"]) ?? "",
        fromId: asNonEmptyString(message["fromId"]),
      };
    case "compactionSummary":
      return {
        role,
        summary: asString(message["summary"]) ?? "",
        tokensBefore: asNumber(message["tokensBefore"]),
      };
    case "system":
      return { role };
    default:
      return { role: "other", originalRole: role };
  }
};

/** User, custom and tool-result content: a string, or text and image blocks. */
export const parseContent = (value: unknown): PiContent => {
  const text = asString(value);
  if (text !== null) {
    return { texts: [text], imageCount: 0 };
  }
  const content: PiContent = { texts: [], imageCount: 0 };
  for (const block of asArray(value) ?? []) {
    const record = asRecord(block);
    if (record?.["type"] === "text") {
      content.texts.push(asString(record["text"]) ?? "");
    } else if (record?.["type"] === "image") {
      content.imageCount++;
    }
  }
  return content;
};

const parseAssistant = (message: JsonRecord): PiAssistantMessage => {
  const parsed: PiAssistantMessage = {
    role: "assistant",
    texts: [],
    reasoning: [],
    redactedThinkingCount: 0,
    toolCalls: [],
    otherBlockTypes: [],
    provider: asNonEmptyString(message["provider"]),
    api: asNonEmptyString(message["api"]),
    model: asNonEmptyString(message["model"]),
    responseModel: asNonEmptyString(message["responseModel"]),
    responseId: asNonEmptyString(message["responseId"]),
    thinkingLevel: asNonEmptyString(message["thinkingLevel"]),
    stopReason: asNonEmptyString(message["stopReason"]),
    errorMessage: asNonEmptyString(message["errorMessage"]),
    usage: parsePiUsage(message["usage"]),
  };
  for (const block of asArray(message["content"]) ?? []) {
    addAssistantBlock(parsed, asRecord(block));
  }
  return parsed;
};

const addAssistantBlock = (
  parsed: PiAssistantMessage,
  block: JsonRecord | null,
) => {
  const type = asString(block?.["type"]);
  if (!block || type === null) {
    return;
  }
  const id = asNonEmptyString(block["id"]);
  const name = asNonEmptyString(block["name"]);
  if (type === "text") {
    parsed.texts.push(asString(block["text"]) ?? "");
  } else if (type === "thinking") {
    const thinking = asString(block["thinking"]) ?? "";
    parsed.reasoning.push(thinking);
    if (block["redacted"] === true && !thinking) {
      parsed.redactedThinkingCount++;
    }
  } else if (type === "toolCall" && id && name) {
    parsed.toolCalls.push({
      id,
      name,
      arguments: asRecord(block["arguments"]) ?? {},
    });
  } else if (!parsed.otherBlockTypes.includes(type)) {
    parsed.otherBlockTypes.push(type);
  }
};
