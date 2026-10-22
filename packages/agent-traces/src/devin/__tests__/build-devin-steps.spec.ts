import { describe, expect, it } from "vitest";
import { buildDevinSteps } from "../build-devin-steps";
import type {
  SpooledHookEvent,
  TimedSpooledEvent,
} from "../../hook-events/spooled-event.types";

const event = (
  name: string,
  payload: SpooledHookEvent["payload"],
  second: number,
): TimedSpooledEvent => ({
  event: { event: name, projectDir: "/repo", cwd: "/repo", payload },
  timestamp: new Date(Date.UTC(2026, 9, 8, 12, 0, second)).toISOString(),
});

describe("buildDevinSteps", () => {
  it("maps prompts, tool calls, final messages and compactions to steps", () => {
    const steps = buildDevinSteps([
      event("SessionStart", { source: "startup", session_id: "s" }, 0),
      event(
        "UserPromptSubmit",
        { prompt: "Fix the tests", prompt_id: "p1" },
        1,
      ),
      event(
        "PostToolUse",
        {
          prompt_id: "p1",
          tool_name: "exec",
          tool_input: { command: "npm test" },
          tool_response: {
            success: false,
            output: "1 failed",
            error: "exit 1",
          },
        },
        2,
      ),
      event(
        "PostToolUse",
        {
          tool_name: "read",
          tool_input: "src/a.ts",
          tool_response: "contents",
        },
        3,
      ),
      event(
        "Stop",
        { last_assistant_message: "Fixed it.", prompt_id: "p1" },
        4,
      ),
      event("Stop", { stop_hook_active: false }, 5),
      event("PostCompaction", { summary: "Earlier: fixed tests" }, 6),
      { event: null, timestamp: "2026-10-08T12:00:07.000Z" },
    ]);

    expect(steps).toEqual([
      {
        step_id: 1,
        timestamp: "2026-10-08T12:00:01.000Z",
        source: "user",
        message: "Fix the tests",
        extra: { prompt_id: "p1" },
      },
      {
        step_id: 2,
        timestamp: "2026-10-08T12:00:02.000Z",
        source: "agent",
        message: "",
        extra: { prompt_id: "p1" },
        tool_calls: [
          {
            tool_call_id: "call_1",
            function_name: "exec",
            arguments: { command: "npm test" },
          },
        ],
        observation: {
          results: [
            {
              source_call_id: "call_1",
              content: "1 failed\nError: exit 1",
              extra: { is_error: true },
            },
          ],
        },
      },
      {
        step_id: 3,
        timestamp: "2026-10-08T12:00:03.000Z",
        source: "agent",
        message: "",
        extra: {},
        tool_calls: [
          {
            tool_call_id: "call_2",
            function_name: "read",
            arguments: { input: "src/a.ts" },
          },
        ],
        observation: {
          results: [
            {
              source_call_id: "call_2",
              content: "contents",
              extra: { is_error: false },
            },
          ],
        },
      },
      {
        step_id: 4,
        timestamp: "2026-10-08T12:00:04.000Z",
        source: "agent",
        message: "Fixed it.",
        extra: { prompt_id: "p1" },
      },
      {
        step_id: 5,
        timestamp: "2026-10-08T12:00:06.000Z",
        source: "user",
        message: "Earlier: fixed tests",
        extra: { is_compact_summary: true },
      },
    ]);
  });

  it("prefers the payload's own event name over the hook argument", () => {
    const steps = buildDevinSteps([
      event(
        "unknown",
        { hook_event_name: "UserPromptSubmit", prompt: "hello" },
        0,
      ),
    ]);
    expect(steps.map((step) => step.message)).toEqual(["hello"]);
  });
});
