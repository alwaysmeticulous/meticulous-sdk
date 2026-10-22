/**
 * Cursor's transcripts hold each message's text and tool calls only: no
 * timestamps, model, usage or tool results, and tool calls have no ids.
 */
export type CursorTranscriptEntry =
  | CursorUserEntry
  | CursorAssistantEntry
  | CursorTurnEndedEntry;

export interface CursorUserEntry {
  kind: "user";
  /** The prompt, unwrapped from Cursor's `<user_query>` tags. */
  text: string;
  /** From the prompt's `<timestamp>` tag, which has minute precision. */
  timestamp: string | null;
}

export interface CursorAssistantEntry {
  kind: "assistant";
  /** Cursor appends any reasoning to the text, so this may include it. */
  text: string;
  /** Only the legacy text format marks reasoning separately. */
  reasoning: string | null;
  /** Cursor wrote `[REDACTED]` in place of the reasoning. */
  reasoningRedacted: boolean;
  toolUses: CursorToolUse[];
  otherBlockTypes: string[];
}

export interface CursorToolUse {
  /** Absent from every format seen so far, but kept if Cursor adds it. */
  id: string | null;
  name: string;
  input: Record<string, unknown>;
}

export interface CursorTurnEndedEntry {
  kind: "turn_ended";
  /** `success`, `error` or `aborted`. */
  status: string | null;
  error: string | null;
}

export interface ParsedCursorTranscript {
  entries: CursorTranscriptEntry[];
  /** An optional summary line Cursor may put first. */
  overview: string | null;
  malformedLineCount: number;
}
