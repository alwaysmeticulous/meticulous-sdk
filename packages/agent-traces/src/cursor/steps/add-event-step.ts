import { assertNever } from "../../utils/assert-never";
import type {
  CursorCompactionEvent,
  CursorHookEvent,
  CursorResponseEvent,
  CursorThoughtEvent,
  CursorToolEvent,
} from "../events/cursor-hook-event.types";
import { asRecord } from "../../utils/json-guards";
import { addPromptStep } from "./add-turn-boundary-steps";
import { applyResponseUsage, applyStop } from "./apply-cursor-usage";
import type { CursorStepContext } from "./cursor-step-context";
import {
  newEventAgentStep,
  nextToolCallId,
  noteModel,
  pushAgentStep,
} from "./cursor-step-context";
import { toToolCall, toToolResult } from "./tool-call-parts";

/**
 * Rebuilds steps from an event no transcript entry accounts for. A thought
 * opens an agent step that the tool calls after it join, as they came from
 * the same model response; without one, each tool call is its own step.
 */
export const addEventStep = (
  context: CursorStepContext,
  event: CursorHookEvent,
): void => {
  switch (event.kind) {
    case "prompt":
      addPromptStep(context, null, event);
      return;
    case "thought":
      addThought(context, event);
      return;
    case "tool":
      addTool(context, event);
      return;
    case "response":
      addResponse(context, event);
      return;
    case "stop":
      applyStop(context, event);
      return;
    case "compaction":
      addCompaction(context, event);
      return;
    case "subagent_start":
    case "subagent_stop":
      // Used to link subagent trajectories, not steps of their own.
      return;
    default:
      assertNever(event);
  }
};

const addThought = (
  context: CursorStepContext,
  event: CursorThoughtEvent,
): void => {
  noteModel(context, event.model);
  context.openStep = null;
  if (event.text.length === 0) {
    return;
  }
  const step = newEventAgentStep(event);
  step.reasoning_content = event.text;
  if (event.durationMs !== null) {
    step.extra = { ...step.extra, thinking_duration_ms: event.durationMs };
  }
  pushAgentStep(context, step);
  context.openStep = step;
};

const addTool = (context: CursorStepContext, event: CursorToolEvent): void => {
  noteModel(context, event.model);
  const id = event.toolUseId ?? nextToolCallId(context);
  let step = context.openStep;
  if (!step) {
    step = newEventAgentStep(event);
    pushAgentStep(context, step);
  }
  step.tool_calls = [
    ...(step.tool_calls ?? []),
    toToolCall(
      id,
      event.toolName,
      asRecord(event.toolInput) ?? { input: event.toolInput },
      null,
    ),
  ];
  step.observation = {
    results: [...(step.observation?.results ?? []), toToolResult(id, event)],
  };
};

/** Joins the thought before it if that response made no tool calls. */
const addResponse = (
  context: CursorStepContext,
  event: CursorResponseEvent,
): void => {
  noteModel(context, event.model);
  const open = context.openStep;
  context.openStep = null;
  if (event.text.length === 0 && !event.usage) {
    return;
  }
  let step = open && !open.tool_calls ? open : null;
  if (step) {
    step.message = event.text;
  } else {
    step = newEventAgentStep(event);
    step.message = event.text;
    pushAgentStep(context, step);
  }
  applyResponseUsage(context, step, event.usage);
};

/** A user step, as Claude Code records compactions, so activity stats count it. */
const addCompaction = (
  context: CursorStepContext,
  event: CursorCompactionEvent,
): void => {
  context.openStep = null;
  context.steps.push({
    step_id: 0,
    timestamp: event.timestamp,
    source: "user",
    message: "",
    extra: {
      is_compact_summary: true,
      ...(event.trigger ? { compaction_trigger: event.trigger } : {}),
      ...(event.contextTokens !== null
        ? { context_tokens: event.contextTokens }
        : {}),
    },
  });
};
