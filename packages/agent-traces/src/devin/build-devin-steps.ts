import type { AtifStep } from "../types/atif.types";
import { truncateObservationContent } from "../atif/truncate-observation-content";
import type { JsonRecord } from "../utils/json-guards";
import { asNonEmptyString, asRecord, asString } from "../utils/json-guards";
import type { TimedSpooledEvent } from "../hook-events/spooled-event.types";

type StepBase = Pick<AtifStep, "step_id" | "timestamp" | "extra">;

/**
 * Rebuilds ATIF steps from hook events. Devin's hooks only expose prompts,
 * finished tool calls and each turn's final message, so those are the only
 * steps; the model's intermediate messages and reasoning aren't available.
 */
export const buildDevinSteps = (events: TimedSpooledEvent[]): AtifStep[] => {
  const steps: AtifStep[] = [];
  let toolCallCount = 0;
  for (const { event, timestamp } of events) {
    if (!event?.payload) {
      continue;
    }
    const eventName =
      asNonEmptyString(event.payload["hook_event_name"]) ?? event.event;
    const step = toStep(eventName, event.payload, timestamp, () => {
      toolCallCount++;
      return `call_${toolCallCount}`;
    });
    if (step) {
      steps.push(step);
    }
  }
  steps.forEach((step, index) => {
    step.step_id = index + 1;
  });
  return steps;
};

const toStep = (
  eventName: string,
  payload: JsonRecord,
  timestamp: string,
  nextToolCallId: () => string,
): AtifStep | null => {
  const promptId = asNonEmptyString(payload["prompt_id"]);
  const base: StepBase = {
    step_id: 0,
    timestamp,
    extra: promptId ? { prompt_id: promptId } : {},
  };
  switch (eventName) {
    case "UserPromptSubmit": {
      const prompt = asString(payload["prompt"]);
      return prompt === null
        ? null
        : { ...base, source: "user", message: prompt };
    }
    case "PostToolUse":
      return toToolStep(payload, base, nextToolCallId());
    case "Stop": {
      const message = asNonEmptyString(payload["last_assistant_message"]);
      return message ? { ...base, source: "agent", message } : null;
    }
    case "PostCompaction":
      // A user step, as Claude Code records it, so activity stats count it.
      return {
        ...base,
        source: "user",
        message: asString(payload["summary"]) ?? "",
        extra: { ...base.extra, is_compact_summary: true },
      };
    default:
      return null;
  }
};

const toToolStep = (
  payload: JsonRecord,
  base: StepBase,
  toolCallId: string,
): AtifStep => {
  const toolInput = payload["tool_input"];
  const response = asRecord(payload["tool_response"]);
  const success =
    typeof response?.["success"] === "boolean" ? response["success"] : null;
  const { content, originalLength } = truncateObservationContent(
    response ? describeResponse(response) : stringify(payload["tool_response"]),
  );
  return {
    ...base,
    source: "agent",
    message: "",
    tool_calls: [
      {
        tool_call_id: toolCallId,
        function_name: asNonEmptyString(payload["tool_name"]) ?? "unknown",
        arguments: asRecord(toolInput) ?? { input: toolInput ?? null },
      },
    ],
    observation: {
      results: [
        {
          source_call_id: toolCallId,
          content,
          extra: {
            is_error: success === false,
            ...(originalLength !== null
              ? { truncated: true, original_length_chars: originalLength }
              : {}),
          },
        },
      ],
    },
  };
};

const describeResponse = (response: JsonRecord): string => {
  const output = stringify(response["output"]);
  const error = stringify(response["error"]);
  return [output, error ? `Error: ${error}` : ""]
    .filter((part) => part.length > 0)
    .join("\n");
};

const stringify = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return value === null || value === undefined ? "" : JSON.stringify(value);
};
