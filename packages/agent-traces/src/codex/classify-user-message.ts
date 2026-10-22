import { asArray, asString } from "../utils/json-guards";

export type UserMessageClass =
  | { kind: "prompt" }
  /** Injected by Codex and worth keeping, e.g. a finished subagent's report. */
  | { kind: "injected"; originKind: string }
  /** Context Codex repeats every turn (environment, AGENTS.md, skills…). */
  | { kind: "context" };

/** `content_item_kinds` values for injected messages that record an event. */
const KEPT_KINDS = new Set([
  "multi_agent.subagent_notification",
  "multi_agent.inter_agent_message",
  "multi_agent.inter_agent_completion_message",
  "shell.user_command",
]);

/**
 * Older rollouts lack `content_item_kinds`, so their injected messages are
 * recognised by the same leading tags Codex itself matches on
 * (`core/src/context/contextual_user_message.rs`).
 */
const KEPT_TAGS = [
  "subagent_notification",
  "user_shell_command",
  "turn_aborted",
];
const CONTEXT_PREFIXES = [
  "<environment_context>",
  "<user_instructions>",
  "# AGENTS.md instructions",
  "<skill>",
  "<codex_internal_context",
  "<goal_context>",
  "<agent_message_board_notification>",
  "<permissions instructions>",
];

export const classifyUserMessage = (
  text: string,
  contentItemKinds: unknown,
): UserMessageClass => {
  const kinds = (asArray(contentItemKinds) ?? []).flatMap((kind) => {
    const value = asString(kind);
    return value ? [value] : [];
  });
  if (kinds.length > 0) {
    if (kinds.some((kind) => kind.startsWith("user."))) {
      return { kind: "prompt" };
    }
    const kept = kinds.find((kind) => KEPT_KINDS.has(kind));
    return kept ? { kind: "injected", originKind: kept } : { kind: "context" };
  }
  const trimmed = text.trimStart();
  const tag = KEPT_TAGS.find((name) => trimmed.startsWith(`<${name}>`));
  if (tag) {
    return { kind: "injected", originKind: tag };
  }
  return CONTEXT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
    ? { kind: "context" }
    : { kind: "prompt" };
};
