import type { AgentTracePullRequest } from "../types/summary.types";

/**
 * A normalised view of the Claude Code transcript lines the converter cares
 * about. Parsing validates at runtime, so format drift in newer Claude Code
 * versions degrades to skipped fields rather than crashes.
 */
export type TranscriptEntry = AssistantEntry | UserEntry;

export interface AssistantEntry {
  kind: "assistant";
  timestamp: string | null;
  /** Claude Code writes one line per content block, sharing this id. */
  messageId: string | null;
  model: string | null;
  stopReason: string | null;
  requestId: string | null;
  blocks: AssistantBlock[];
  usage: TranscriptUsage | null;
}

export interface UserEntry {
  kind: "user";
  uuid: string | null;
  timestamp: string | null;
  isMeta: boolean;
  isCompactSummary: boolean;
  originKind: string | null;
  blocks: UserBlock[];
}

export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "other"; originalType: string };

export type UserBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_result";
      toolUseId: string;
      /** Flattened to text, with images replaced by a placeholder. */
      content: string;
      isError: boolean;
    }
  | { type: "other"; originalType: string };

export interface TranscriptUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  thinkingTokens: number | null;
  serviceTier: string | null;
  cacheCreation: Record<string, unknown> | null;
}

export interface TranscriptMetadata {
  cwd: string | null;
  /** The last branch seen. */
  gitBranch: string | null;
  /** Every branch seen, in the order first seen. */
  gitBranches: string[];
  entrypoint: string | null;
  permissionModes: string[];
  pullRequests: AgentTracePullRequest[];
  version: string | null;
  slug: string | null;
  startedAt: string | null;
  endedAt: string | null;
  aiTitle: string | null;
  customTitle: string | null;
  summaryTitle: string | null;
  reportedCostUsd: number | null;
  malformedLineCount: number;
}

export const IMAGE_PLACEHOLDER = "[image omitted]";
