import type { AtifToolCall } from "../types/atif.types";
import type { JsonRecord } from "../utils/json-guards";
import {
  asArray,
  asNonEmptyString,
  asRecord,
  asString,
} from "../utils/json-guards";
import { classifyUserMessage } from "./classify-user-message";
import type { CodexEntryBody } from "./codex-entry.types";
import { contentToText, IMAGE_PLACEHOLDER } from "./content-to-text";

/** Converts one `response_item` payload; unknown item types yield nothing. */
export const parseResponseItem = (
  item: JsonRecord,
  syntheticId: () => string,
): CodexEntryBody[] => {
  switch (item["type"]) {
    case "message":
      return parseMessage(item);
    case "reasoning":
      return [
        {
          kind: "reasoning",
          summary: contentToText(item["summary"]),
          content: contentToText(item["content"]),
          encrypted: asNonEmptyString(item["encrypted_content"]) !== null,
        },
      ];
    case "function_call":
      return toolCall(item, asString(item["call_id"]), {
        arguments: parseArguments(item["arguments"]),
        extra: withDefined({ namespace: asNonEmptyString(item["namespace"]) }),
      });
    case "custom_tool_call":
      return toolCall(item, asString(item["call_id"]), {
        arguments: { input: asString(item["input"]) ?? "" },
        extra: withDefined({ namespace: asNonEmptyString(item["namespace"]) }),
      });
    case "local_shell_call":
      return toolCall(item, asString(item["call_id"]) ?? asString(item["id"]), {
        name: "local_shell",
        arguments: asRecord(item["action"]) ?? {},
      });
    case "tool_search_call":
      return toolCall(item, asString(item["call_id"]) ?? syntheticId(), {
        name: "tool_search",
        arguments: asRecord(item["arguments"]) ?? {},
      });
    case "web_search_call":
      return toolCall(item, asString(item["id"]) ?? syntheticId(), {
        name: "web_search",
        arguments: asRecord(item["action"]) ?? {},
        extra: withDefined({ status: asNonEmptyString(item["status"]) }),
      });
    case "image_generation_call":
      return parseImageGeneration(item, syntheticId);
    case "function_call_output":
    case "custom_tool_call_output":
      return toolOutput(
        asString(item["call_id"]),
        contentToText(item["output"]),
      );
    case "tool_search_output":
      return toolOutput(
        asString(item["call_id"]),
        describeTools(item["tools"]),
      );
    case "agent_message":
      return [
        {
          kind: "user",
          text: contentToText(item["content"]),
          originKind: "agent_message",
        },
      ];
    default:
      return [];
  }
};

const parseMessage = (item: JsonRecord): CodexEntryBody[] => {
  const text = contentToText(item["content"]);
  if (item["role"] === "assistant") {
    return [
      {
        kind: "assistant",
        messageId: asNonEmptyString(item["id"]),
        text,
        phase: asNonEmptyString(item["phase"]),
      },
    ];
  }
  if (item["role"] !== "user") {
    return [];
  }
  const passthrough = asRecord(
    item["internal_chat_message_metadata_passthrough"],
  );
  const classified = classifyUserMessage(
    text,
    passthrough?.["content_item_kinds"],
  );
  switch (classified.kind) {
    case "prompt":
      return [{ kind: "user", text, originKind: null }];
    case "injected":
      return [{ kind: "user", text, originKind: classified.originKind }];
    case "context":
      return [];
  }
};

const parseImageGeneration = (
  item: JsonRecord,
  syntheticId: () => string,
): CodexEntryBody[] => {
  const callId = asString(item["id"]) ?? syntheticId();
  return [
    ...toolCall(item, callId, {
      name: "image_generation",
      arguments: withDefined({
        revised_prompt: asNonEmptyString(item["revised_prompt"]),
      }),
    }),
    ...toolOutput(callId, IMAGE_PLACEHOLDER),
  ];
};

const toolCall = (
  item: JsonRecord,
  callId: string | null,
  call: {
    name?: string;
    arguments: Record<string, unknown>;
    extra?: JsonRecord;
  },
): CodexEntryBody[] => {
  const name = call.name ?? asNonEmptyString(item["name"]);
  if (!callId || !name) {
    return [];
  }
  const toolCallEntry: AtifToolCall = {
    tool_call_id: callId,
    function_name: name,
    arguments: call.arguments,
    ...(call.extra && Object.keys(call.extra).length > 0
      ? { extra: call.extra }
      : {}),
  };
  return [{ kind: "tool-call", call: toolCallEntry }];
};

const toolOutput = (callId: string | null, content: string): CodexEntryBody[] =>
  callId ? [{ kind: "tool-output", callId, content }] : [];

/** The Responses API sends arguments as a JSON string; ATIF wants an object. */
const parseArguments = (value: unknown): Record<string, unknown> => {
  const raw = asString(value);
  if (raw === null) {
    return asRecord(value) ?? {};
  }
  try {
    return asRecord(JSON.parse(raw)) ?? { raw_arguments: raw };
  } catch {
    return { raw_arguments: raw };
  }
};

const describeTools = (tools: unknown): string =>
  (asArray(tools) ?? [])
    .map((tool) => {
      const record = asRecord(tool);
      return asString(record?.["name"]) ?? asString(record?.["type"]) ?? "";
    })
    .filter((name) => name.length > 0)
    .join("\n");

const withDefined = (values: Record<string, unknown>): JsonRecord =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null),
  );
