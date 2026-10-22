import { cleanUserText } from "./clean-message-text";
import type {
  CursorToolUse,
  CursorTranscriptEntry,
  ParsedCursorTranscript,
} from "./cursor-transcript.types";

const ROLE_MARKER_REGEX = /^(user|assistant|A):$/;
const TURN_ENDED_REGEX = /^Turn ended: (success|error|aborted)[.:]?\s*(.*)$/;
const TOOL_CALL_PREFIX = "[Tool call] ";
const TOOL_RESULT_PREFIX = "[Tool result] ";
const THINKING_PREFIX = "[Thinking]";
const TOOL_ARGUMENT_REGEX = /^ {2}([^:]+): (.*)$/;

interface OpenMessage {
  role: "user" | "assistant";
  lines: string[];
  reasoning: string[];
  toolUses: CursorToolUse[];
}

/**
 * Older Cursor versions' plain-text transcripts: `user:` / `assistant:` (or
 * `A:`) blocks, with `[Thinking] …`, `[Tool call] Name` followed by
 * `  key: value` lines, and `[Tool result] Name` markers. Lossier than JSONL,
 * since a reasoning or argument value spanning lines can't be told apart from
 * the text after it.
 */
export const parseCursorTextTranscript = (
  text: string,
): ParsedCursorTranscript => {
  const entries: CursorTranscriptEntry[] = [];
  let open: OpenMessage | null = null;
  const close = () => {
    if (open) {
      entries.push(toEntry(open));
      open = null;
    }
  };
  for (const line of text.split(/\r?\n/)) {
    const role = ROLE_MARKER_REGEX.exec(line.trim())?.[1];
    const turnEnded = TURN_ENDED_REGEX.exec(line.trim());
    if (role) {
      close();
      open = newMessage(role === "user" ? "user" : "assistant");
    } else if (turnEnded) {
      close();
      entries.push({
        kind: "turn_ended",
        status: turnEnded[1] ?? null,
        error: turnEnded[2] || null,
      });
    } else if (open) {
      addLine(open, line);
    }
  }
  close();
  return { entries, overview: null, malformedLineCount: 0 };
};

const newMessage = (role: OpenMessage["role"]): OpenMessage => ({
  role,
  lines: [],
  reasoning: [],
  toolUses: [],
});

const addLine = (message: OpenMessage, line: string): void => {
  const lastToolUse = message.toolUses.at(-1);
  const argument = TOOL_ARGUMENT_REGEX.exec(line);
  if (message.role === "user") {
    message.lines.push(line);
  } else if (line.startsWith(TOOL_CALL_PREFIX)) {
    message.toolUses.push({
      id: null,
      name: line.slice(TOOL_CALL_PREFIX.length).trim() || "unknown",
      input: {},
    });
  } else if (argument && lastToolUse) {
    lastToolUse.input[argument[1] ?? ""] = parseArgumentValue(
      argument[2] ?? "",
    );
  } else if (line.startsWith(THINKING_PREFIX)) {
    message.reasoning.push(line.slice(THINKING_PREFIX.length).trim());
  } else if (!line.startsWith(TOOL_RESULT_PREFIX)) {
    message.lines.push(line);
  }
};

const toEntry = (message: OpenMessage): CursorTranscriptEntry => {
  const text = message.lines.join("\n").trim();
  if (message.role === "user") {
    return { kind: "user", ...cleanUserText(text) };
  }
  return {
    kind: "assistant",
    text,
    reasoning:
      message.reasoning.length > 0 ? message.reasoning.join("\n") : null,
    reasoningRedacted: false,
    toolUses: message.toolUses,
    otherBlockTypes: [],
  };
};

/** Objects were written as JSON, everything else with `String()`. */
const parseArgumentValue = (value: string): unknown => {
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
};
