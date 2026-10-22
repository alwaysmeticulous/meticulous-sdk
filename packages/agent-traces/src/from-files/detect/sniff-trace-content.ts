import type { JsonRecord } from "../../utils/json-guards";
import { asArray, asNonEmptyString, asRecord } from "../../utils/json-guards";

/**
 * Checked in this order. Codex and Pi both start with a typed header line,
 * but only Codex's carries a `payload`; Cursor's lines have a top-level
 * `role` and Claude Code's never do.
 */
export const sniffJsonlFormat = (
  records: JsonRecord[],
): "codex" | "pi" | "cursor" | "claude-code" | null => {
  if (isCodexRollout(records)) {
    return "codex";
  }
  if (isPiSession(records)) {
    return "pi";
  }
  if (isCursorJsonlTranscript(records)) {
    return "cursor";
  }
  return isClaudeCodeTranscript(records) ? "claude-code" : null;
};

export const sniffJsonFormat = (value: unknown): "atif" | "opencode" | null => {
  if (isAtifDocument(value)) {
    return "atif";
  }
  return isOpenCodeExport(value) ? "opencode" : null;
};

export const isCursorTextTranscript = (text: string): boolean =>
  /^user:\s*$/m.test(text) && text.includes("<user_query>");

const isCodexRollout = ([first]: JsonRecord[]): boolean =>
  first?.["type"] === "session_meta" &&
  !!asNonEmptyString(asRecord(first["payload"])?.["id"]);

const isPiSession = ([first]: JsonRecord[]): boolean =>
  first?.["type"] === "session" &&
  !!asNonEmptyString(first["id"]) &&
  !("payload" in first);

const CURSOR_MARKER_TYPES = new Set(["metadata", "turn_ended"]);

const isCursorJsonlTranscript = (records: JsonRecord[]): boolean => {
  const messages = records.filter(
    (record) => !CURSOR_MARKER_TYPES.has(record["type"] as string),
  );
  return (
    messages.length > 0 &&
    messages.every(
      (record) => typeof record["role"] === "string" && !("type" in record),
    )
  );
};

const CLAUDE_CODE_ID_KEYS = ["sessionId", "uuid", "leafUuid"];

const isClaudeCodeTranscript = (records: JsonRecord[]): boolean =>
  records.every((record) => !("role" in record)) &&
  records.some(
    (record) =>
      typeof record["type"] === "string" &&
      CLAUDE_CODE_ID_KEYS.some((key) => typeof record[key] === "string"),
  );

const isAtifDocument = (value: unknown): boolean => {
  const record = asRecord(value);
  return (
    !!asNonEmptyString(record?.["schema_version"])?.startsWith("ATIF-") &&
    asRecord(record?.["agent"]) !== null &&
    asArray(record?.["steps"]) !== null
  );
};

const isOpenCodeExport = (value: unknown): boolean => {
  const record = asRecord(value);
  return (
    !!asNonEmptyString(asRecord(record?.["info"])?.["id"])?.startsWith(
      "ses_",
    ) && asArray(record?.["messages"]) !== null
  );
};
