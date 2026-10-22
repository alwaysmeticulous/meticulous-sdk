import { ATIF_EXTRA_DURATION_MS } from "../atif/tool-result-duration";
import type { AtifStep } from "../types/atif.types";
import { assertNever } from "../utils/assert-never";
import { getElapsedMs } from "../atif/elapsed-ms";
import { truncateObservationContent } from "../atif/truncate-observation-content";
import type { CodexEntry } from "./codex-entry.types";
import type { CodexStepAccumulator } from "./codex-step-accumulator";
import {
  addModelOutput,
  addUsage,
  createStepAccumulator,
  finalizeStep,
} from "./codex-step-accumulator";
import { outputLooksFailed } from "./detect-tool-error";
import type { EventMsgState } from "./parse-event-msg";

export type CodexCallEvents = Pick<
  EventMsgState,
  "failedCallIds" | "durationMsByCallId"
>;

interface BuildContext {
  steps: AtifStep[];
  open: CodexStepAccumulator | null;
  stepsByCallId: Map<string, AtifStep>;
  /** When each tool call's line was written. */
  callTimestamps: Map<string, string>;
  events: CodexCallEvents;
  model: string | null;
  effort: string | null;
}

/**
 * Converts one thread's entries into ATIF steps: an agent step per model
 * response, with tool results attached to the step that issued the call.
 */
export const buildCodexSteps = (
  entries: CodexEntry[],
  events: CodexCallEvents,
): AtifStep[] => {
  const context: BuildContext = {
    steps: [],
    open: null,
    stepsByCallId: new Map(),
    callTimestamps: new Map(),
    events,
    model: null,
    effort: null,
  };
  for (const entry of entries) {
    addEntry(context, entry);
  }
  closeStep(context);
  context.steps.forEach((step, index) => {
    step.step_id = index + 1;
  });
  return context.steps;
};

const addEntry = (context: BuildContext, entry: CodexEntry): void => {
  switch (entry.kind) {
    case "turn-context":
      closeStep(context);
      context.model = entry.model ?? context.model;
      context.effort = entry.effort ?? context.effort;
      break;
    case "turn-boundary":
      closeStep(context);
      break;
    case "user":
    case "compaction":
      closeStep(context);
      context.steps.push(toUserStep(entry));
      break;
    case "assistant":
    case "reasoning":
    case "tool-call": {
      const accumulator = openStep(context, entry);
      addModelOutput(accumulator, entry);
      if (entry.kind === "tool-call") {
        context.stepsByCallId.set(entry.call.tool_call_id, accumulator.step);
        if (entry.timestamp) {
          context.callTimestamps.set(entry.call.tool_call_id, entry.timestamp);
        }
      }
      break;
    }
    case "tool-output":
      attachToolOutput(context, entry);
      break;
    case "usage":
      if (!entry.copied) {
        const accumulator =
          context.open && !context.open.metered
            ? context.open
            : openStep(context, entry, { fresh: true });
        addUsage(accumulator, entry.usage, entry.responseId);
        closeStep(context);
      }
      break;
    default:
      assertNever(entry);
  }
};

const openStep = (
  context: BuildContext,
  entry: CodexEntry,
  { fresh }: { fresh: boolean } = { fresh: false },
): CodexStepAccumulator => {
  if (context.open && (fresh || context.open.sawToolOutput)) {
    closeStep(context);
  }
  if (!context.open) {
    context.open = createStepAccumulator(entry, context.model, context.effort);
    context.steps.push(context.open.step);
  }
  return context.open;
};

const closeStep = (context: BuildContext): void => {
  if (context.open) {
    finalizeStep(context.open);
    context.open = null;
  }
};

const toUserStep = (
  entry: Extract<CodexEntry, { kind: "user" | "compaction" }>,
): AtifStep => {
  const extra = {
    ...(entry.kind === "user" && entry.originKind
      ? { origin_kind: entry.originKind }
      : {}),
    ...(entry.kind === "compaction" ? { is_compact_summary: true } : {}),
    ...(entry.reverted ? { reverted: true } : {}),
  };
  return {
    step_id: 0,
    ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    source: "user",
    message: entry.kind === "user" ? entry.text : entry.summary,
    ...(entry.copied ? { is_copied_context: true } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
};

const attachToolOutput = (
  context: BuildContext,
  entry: Extract<CodexEntry, { kind: "tool-output" }>,
): void => {
  const { content, originalLength } = truncateObservationContent(entry.content);
  const durationMs =
    context.events.durationMsByCallId.get(entry.callId) ??
    getElapsedMs(context.callTimestamps.get(entry.callId), entry.timestamp);
  const extra = {
    is_error:
      context.events.failedCallIds.has(entry.callId) ||
      outputLooksFailed(entry.content),
    ...(originalLength !== null
      ? { truncated: true, original_length_chars: originalLength }
      : {}),
    ...(durationMs !== null ? { [ATIF_EXTRA_DURATION_MS]: durationMs } : {}),
  };
  const step = context.stepsByCallId.get(entry.callId);
  if (step) {
    step.observation ??= { results: [] };
    step.observation.results.push({
      source_call_id: entry.callId,
      content,
      extra,
    });
    if (context.open?.step === step) {
      context.open.sawToolOutput = true;
    }
    return;
  }
  // ATIF only allows `source_call_id` to reference a call in the same step.
  context.steps.push({
    step_id: 0,
    ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    source: "system",
    message: "",
    observation: {
      results: [
        { content, extra: { ...extra, orphan_tool_call_id: entry.callId } },
      ],
    },
  });
};
