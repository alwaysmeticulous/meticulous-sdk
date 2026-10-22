import type { AtifToolCall } from "../types/atif.types";

/**
 * A normalised view of the rollout lines the converter cares about. Codex
 * records most things twice (`response_item` for the model's history and
 * `event_msg` for its UI); messages, reasoning and tool calls are taken from
 * `response_item` only, and token usage from `token_usage_record`, falling
 * back to deduplicated `token_count` events in older rollouts.
 */
export type CodexEntry = CodexEntryBody & CodexEntryPosition;

export interface CodexEntryPosition {
  timestamp: string | null;
  /** Inherited from a parent thread (forked context), not this thread's work. */
  copied: boolean;
  /** Dropped from the thread's history by a later revert. */
  reverted: boolean;
}

export type CodexEntryBody =
  | { kind: "turn-context"; model: string | null; effort: string | null }
  | { kind: "turn-boundary" }
  | { kind: "user"; text: string; originKind: string | null }
  | { kind: "compaction"; summary: string }
  | {
      kind: "assistant";
      messageId: string | null;
      text: string;
      phase: string | null;
    }
  | { kind: "reasoning"; summary: string; content: string; encrypted: boolean }
  | { kind: "tool-call"; call: AtifToolCall }
  | { kind: "tool-output"; callId: string; content: string }
  | { kind: "usage"; usage: CodexTokenUsage; responseId: string | null };

/** Codex's `TokenUsage`: `input_tokens` already includes cached input. */
export interface CodexTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}
