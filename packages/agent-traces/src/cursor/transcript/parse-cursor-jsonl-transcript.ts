import type { JsonRecord } from "../../utils/json-guards";
import {
  asArray,
  asNonEmptyString,
  asRecord,
  asString,
} from "../../utils/json-guards";
import { cleanUserText, splitRedactedReasoning } from "./clean-message-text";
import type {
  CursorAssistantEntry,
  CursorToolUse,
  CursorTranscriptEntry,
  ParsedCursorTranscript,
} from "./cursor-transcript.types";

/**
 * Lines are `{"role","message":{"content":[text | tool_use]}}`, plus
 * `{"type":"turn_ended","status"}` after each turn and an optional leading
 * `{"type":"metadata","metadata":{"overview"}}`.
 */
export const parseCursorJsonlTranscript = (
  text: string,
): ParsedCursorTranscript => {
  const parsed: ParsedCursorTranscript = {
    entries: [],
    overview: null,
    malformedLineCount: 0,
  };
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    const record = parseLine(line);
    if (!record) {
      parsed.malformedLineCount++;
      continue;
    }
    if (record["type"] === "metadata") {
      parsed.overview ??= asNonEmptyString(
        asRecord(record["metadata"])?.["overview"],
      );
      continue;
    }
    const entry = toEntry(record);
    if (entry) {
      parsed.entries.push(entry);
    } else {
      parsed.malformedLineCount++;
    }
  }
  return parsed;
};

const parseLine = (line: string): JsonRecord | null => {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return null;
  }
};

const toEntry = (record: JsonRecord): CursorTranscriptEntry | null => {
  if (record["type"] === "turn_ended") {
    return {
      kind: "turn_ended",
      status: asNonEmptyString(record["status"]),
      error: asNonEmptyString(record["error"]),
    };
  }
  const blocks = asArray(asRecord(record["message"])?.["content"]);
  if (!blocks) {
    return null;
  }
  switch (record["role"]) {
    case "user":
      return { kind: "user", ...cleanUserText(joinTexts(blocks)) };
    case "assistant":
      return toAssistantEntry(blocks);
    default:
      return null;
  }
};

const toAssistantEntry = (blocks: unknown[]): CursorAssistantEntry => {
  const toolUses: CursorToolUse[] = [];
  const reasoning: string[] = [];
  const otherBlockTypes = new Set<string>();
  for (const block of blocks.map(asRecord)) {
    const type = asString(block?.["type"]);
    if (type === "tool_use") {
      toolUses.push(toToolUse(block ?? {}));
    } else if (type === "thinking") {
      reasoning.push(asString(block?.["thinking"]) ?? "");
    } else if (type !== "text") {
      otherBlockTypes.add(type ?? "unknown");
    }
  }
  return {
    kind: "assistant",
    ...splitRedactedReasoning(joinTexts(blocks)),
    reasoning: reasoning.length > 0 ? reasoning.join("\n\n") : null,
    toolUses,
    otherBlockTypes: [...otherBlockTypes],
  };
};

const toToolUse = (block: JsonRecord): CursorToolUse => {
  const input = block["input"];
  return {
    id: asNonEmptyString(block["id"]),
    name: asNonEmptyString(block["name"]) ?? "unknown",
    input: asRecord(input) ?? (input === undefined ? {} : { input }),
  };
};

const joinTexts = (blocks: unknown[]): string =>
  blocks
    .map(asRecord)
    .filter((block) => block?.["type"] === "text")
    .map((block) => asString(block?.["text"]) ?? "")
    .join("\n\n");
