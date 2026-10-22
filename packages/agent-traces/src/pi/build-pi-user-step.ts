import type { AtifExtra, AtifStep } from "../types/atif.types";
import { asNonEmptyString, asNumber, asString } from "../utils/json-guards";
import { describeBashExecution } from "./describe-bash-execution";
import type { PiEntry } from "./pi-entry.types";
import type { PiBashExecutionMessage, PiContent } from "./pi-message.types";
import { parsePiUsage, piUsageToMetrics } from "./pi-usage";

/**
 * Steps with an `origin_kind` were injected by Pi or an extension rather
 * than typed by the user, so they don't count as prompts.
 */
const buildPiUserStep = (
  entry: PiEntry,
  message: string,
  extra: AtifExtra,
): AtifStep => ({
  step_id: 0,
  ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
  source: "user",
  message,
  extra: { entry_id: entry.id, ...extra },
});

export const buildPromptStep = (
  entry: PiEntry,
  content: PiContent,
): AtifStep | null =>
  content.texts.length > 0 || content.imageCount > 0
    ? buildPiUserStep(entry, content.texts.join("\n\n"), {
        ...(content.imageCount > 0 ? { image_count: content.imageCount } : {}),
      })
    : null;

export const buildCompactionSummaryStep = (
  entry: PiEntry,
  summary: unknown,
  tokensBefore: unknown,
): AtifStep =>
  buildPiUserStep(entry, asString(summary) ?? "", {
    is_compact_summary: true,
    tokens_before: asNumber(tokensBefore),
    ...summaryUsageExtra(entry),
  });

export const buildBranchSummaryStep = (
  entry: PiEntry,
  summary: unknown,
  fromId: unknown,
): AtifStep =>
  buildPiUserStep(entry, asString(summary) ?? "", {
    origin_kind: "branch_summary",
    from_entry_id: asNonEmptyString(fromId),
    ...summaryUsageExtra(entry),
  });

export const buildCustomMessageStep = (
  entry: PiEntry,
  content: PiContent,
  customType: string | null,
  display: boolean,
): AtifStep =>
  buildPiUserStep(entry, content.texts.join("\n\n"), {
    origin_kind: "custom_message",
    custom_type: customType,
    display,
  });

export const buildBashExecutionStep = (
  entry: PiEntry,
  message: PiBashExecutionMessage,
): AtifStep =>
  buildPiUserStep(entry, describeBashExecution(message), {
    origin_kind: "bash_execution",
    exit_code: message.exitCode,
    ...(message.excludeFromContext ? { exclude_from_context: true } : {}),
  });

/** The LLM call that wrote a compaction or branch summary. */
const summaryUsageExtra = (entry: PiEntry): AtifExtra => {
  const usage = parsePiUsage(entry.raw["usage"]);
  return usage ? { summary_metrics: piUsageToMetrics(usage) } : {};
};
