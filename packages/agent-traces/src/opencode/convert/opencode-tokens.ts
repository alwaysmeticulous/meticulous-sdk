import type { AtifMetrics } from "../../types/atif.types";
import { asNumber, asRecord } from "../../utils/json-guards";

/** OpenCode's `tokens` object, as on assistant messages and step-finish parts. */
export interface OpenCodeTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export const ZERO_OPENCODE_TOKENS: OpenCodeTokens = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const parseOpenCodeTokens = (value: unknown): OpenCodeTokens | null => {
  const tokens = asRecord(value);
  if (!tokens) {
    return null;
  }
  const cache = asRecord(tokens["cache"]);
  return {
    input: asNumber(tokens["input"]) ?? 0,
    output: asNumber(tokens["output"]) ?? 0,
    reasoning: asNumber(tokens["reasoning"]) ?? 0,
    cacheRead: asNumber(cache?.["read"]) ?? 0,
    cacheWrite: asNumber(cache?.["write"]) ?? 0,
  };
};

export const addOpenCodeTokens = (
  a: OpenCodeTokens,
  b: OpenCodeTokens,
): OpenCodeTokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  reasoning: a.reasoning + b.reasoning,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

export const isZeroOpenCodeTokens = (tokens: OpenCodeTokens): boolean =>
  tokens.input === 0 &&
  tokens.output === 0 &&
  tokens.reasoning === 0 &&
  tokens.cacheRead === 0 &&
  tokens.cacheWrite === 0;

export interface TokenSemantics {
  /** True before OpenCode 1.3.16, when `output` still included reasoning. */
  outputIncludesReasoning: boolean;
}

const FIRST_VERSION_EXCLUDING_REASONING = [1, 3, 16];

/** Unparseable versions (e.g. local builds) are assumed to be current. */
export const tokenSemanticsForVersion = (
  version: string | null,
): TokenSemantics => {
  const parts = /^(\d+)\.(\d+)\.(\d+)/
    .exec(version ?? "")
    ?.slice(1)
    .map(Number);
  if (!parts) {
    return { outputIncludesReasoning: false };
  }
  const firstDifference = parts.findIndex(
    (part, index) => part !== FIRST_VERSION_EXCLUDING_REASONING[index],
  );
  return {
    outputIncludesReasoning:
      firstDifference !== -1 &&
      (parts[firstDifference] ?? 0) <
        (FIRST_VERSION_EXCLUDING_REASONING[firstDifference] ?? 0),
  };
};

/**
 * OpenCode splits the provider's counts into buckets (see `Session.getUsage`):
 * `input` excludes cache reads and writes, and since 1.3.16 `output` excludes
 * reasoning. ATIF's `prompt_tokens` counts every input token and
 * `completion_tokens` every generated one, so the buckets are summed back.
 */
export const openCodeTokensToMetrics = (
  tokens: OpenCodeTokens,
  costUsd: number | null,
  { outputIncludesReasoning }: TokenSemantics,
): AtifMetrics => ({
  prompt_tokens: tokens.input + tokens.cacheRead + tokens.cacheWrite,
  completion_tokens: outputIncludesReasoning
    ? tokens.output
    : tokens.output + tokens.reasoning,
  cached_tokens: tokens.cacheRead,
  ...(costUsd !== null ? { cost_usd: costUsd } : {}),
  extra: {
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    reasoning_tokens: tokens.reasoning,
    cache_read_input_tokens: tokens.cacheRead,
    cache_creation_input_tokens: tokens.cacheWrite,
  },
});
