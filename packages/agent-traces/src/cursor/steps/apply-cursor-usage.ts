import type { AtifMetrics, AtifStep } from "../../types/atif.types";
import type {
  CursorStopEvent,
  CursorTokenUsage,
} from "../events/cursor-hook-event.types";
import type { CursorStepContext } from "./cursor-step-context";
import { noteModel, pushAgentStep } from "./cursor-step-context";

/**
 * Cursor reports usage per generation (a prompt's whole run of model calls)
 * on `stop`, and the same totals on that generation's `afterAgentResponse`.
 * A response's usage stands only until its generation's `stop` arrives.
 */
export const applyResponseUsage = (
  context: CursorStepContext,
  step: AtifStep,
  usage: CursorTokenUsage | null,
): void => {
  if (usage) {
    step.metrics = usageToMetrics(usage);
    context.turn.responseUsageSteps.push(step);
  }
};

/** Puts the generation's usage and outcome on the turn's last agent step. */
export const applyStop = (
  context: CursorStepContext,
  event: CursorStopEvent,
): void => {
  context.openStep = null;
  noteModel(context, event.model);
  let target = context.turn.agentSteps.at(-1) ?? null;
  if (event.usage) {
    for (const step of context.turn.responseUsageSteps) {
      delete step.metrics;
    }
    context.turn.responseUsageSteps = [];
    if (!target) {
      target = {
        step_id: 0,
        timestamp: event.timestamp,
        source: "agent",
        ...(event.model ? { model_name: event.model } : {}),
        message: "",
      };
      pushAgentStep(context, target);
    }
    target.metrics = addMetrics(target.metrics, usageToMetrics(event.usage));
  }
  if (target) {
    target.extra = {
      ...target.extra,
      ...(event.status ? { stop_status: event.status } : {}),
      ...(event.loopCount ? { loop_count: event.loopCount } : {}),
    };
  }
};

/** Cursor's input count already includes cache reads and writes. */
const usageToMetrics = (usage: CursorTokenUsage): AtifMetrics => ({
  prompt_tokens: usage.inputTokens,
  completion_tokens: usage.outputTokens,
  cached_tokens: usage.cacheReadTokens,
  extra: {
    cache_creation_input_tokens: usage.cacheWriteTokens,
    usage_scope: "generation",
  },
});

/** A stop hook's follow-up runs another generation in the same turn. */
const addMetrics = (
  existing: AtifMetrics | undefined,
  added: AtifMetrics,
): AtifMetrics => {
  if (!existing) {
    return added;
  }
  const cacheCreation = (metrics: AtifMetrics) => {
    const value = metrics.extra?.["cache_creation_input_tokens"];
    return typeof value === "number" ? value : 0;
  };
  return {
    prompt_tokens: (existing.prompt_tokens ?? 0) + (added.prompt_tokens ?? 0),
    completion_tokens:
      (existing.completion_tokens ?? 0) + (added.completion_tokens ?? 0),
    cached_tokens: (existing.cached_tokens ?? 0) + (added.cached_tokens ?? 0),
    extra: {
      ...added.extra,
      cache_creation_input_tokens:
        cacheCreation(existing) + cacheCreation(added),
    },
  };
};
