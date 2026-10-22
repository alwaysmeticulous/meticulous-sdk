import type { AtifStep } from "../../types/atif.types";
import { describe, expect, it } from "vitest";
import type {
  CursorHookEvent,
  CursorHookEventBase,
} from "../events/cursor-hook-event.types";
import { buildCursorTimeline } from "../merge/build-cursor-timeline";
import { buildCursorSteps } from "../steps/build-cursor-steps";
import type {
  CursorAssistantEntry,
  CursorTranscriptEntry,
} from "../transcript/cursor-transcript.types";

const user = (text: string): CursorTranscriptEntry => ({
  kind: "user",
  text,
  timestamp: null,
});
const assistant = (
  text: string,
  toolNames: string[] = [],
  overrides: Partial<CursorAssistantEntry> = {},
): CursorTranscriptEntry => ({
  kind: "assistant",
  text,
  reasoning: null,
  reasoningRedacted: false,
  toolUses: toolNames.map((name) => ({
    id: null,
    name,
    input: { from: "transcript" },
  })),
  otherBlockTypes: [],
  ...overrides,
});

let second = 0;
const base = (): CursorHookEventBase => ({
  timestamp: new Date(Date.UTC(2026, 9, 8, 12, 0, second++)).toISOString(),
  generationId: "g",
  model: "gpt-5",
  parentToolCallId: null,
});
const prompt = (text: string): CursorHookEvent => ({
  ...base(),
  kind: "prompt",
  prompt: text,
  attachments: [],
  composerMode: null,
});
const tool = (name: string, id: string): CursorHookEvent => ({
  ...base(),
  kind: "tool",
  toolName: name,
  toolInput: { from: "hook" },
  toolUseId: id,
  output: `${id} output`,
  isError: false,
  durationMs: null,
  failureType: null,
  isInterrupt: false,
  cwd: null,
});
const thought = (text: string): CursorHookEvent => ({
  ...base(),
  kind: "thought",
  text,
  durationMs: null,
});
const response = (text: string): CursorHookEvent => ({
  ...base(),
  kind: "response",
  text,
  usage: null,
});
const stop = (inputTokens: number): CursorHookEvent => ({
  ...base(),
  kind: "stop",
  status: "completed",
  loopCount: 0,
  usage: {
    inputTokens,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
});

const merge = (entries: CursorTranscriptEntry[], events: CursorHookEvent[]) =>
  buildCursorSteps(buildCursorTimeline(entries, events)).map(summarise);

const summarise = (step: AtifStep) => ({
  source: step.source,
  message: step.message,
  ...(step.reasoning_content ? { reasoning: step.reasoning_content } : {}),
  ...(step.tool_calls
    ? {
        calls: step.tool_calls.map(
          (call) => `${call.function_name}#${call.tool_call_id}`,
        ),
      }
    : {}),
  ...(step.observation
    ? {
        results: step.observation.results.map(
          (result) => result.content ?? null,
        ),
      }
    : {}),
  ...(step.metrics ? { promptTokens: step.metrics.prompt_tokens } : {}),
});

describe("merging a Cursor transcript with its hook events", () => {
  it("keeps the transcript's earlier turns when hooks were installed mid-session", () => {
    const steps = merge(
      [
        user("first question"),
        assistant("Reading.", ["Read"]),
        assistant("First answer."),
        user("second question"),
        assistant("Reading again.", ["Read"]),
        assistant("Second answer."),
      ],
      [
        prompt("second question"),
        tool("Read", "r2"),
        response("Second answer."),
        stop(10),
      ],
    );
    expect(steps).toEqual([
      { source: "user", message: "first question" },
      { source: "agent", message: "Reading.", calls: ["Read#call_1"] },
      { source: "agent", message: "First answer." },
      { source: "user", message: "second question" },
      {
        source: "agent",
        message: "Reading again.",
        calls: ["Read#r2"],
        results: ["r2 output"],
      },
      { source: "agent", message: "Second answer.", promptTokens: 10 },
    ]);
  });

  it("pairs the later calls when hooks were installed partway through a turn", () => {
    const steps = merge(
      [
        user("go"),
        assistant("", ["Read"]),
        assistant("", ["Read"]),
        assistant("Done."),
      ],
      [tool("Read", "late"), stop(5)],
    );
    expect(steps).toEqual([
      { source: "user", message: "go" },
      { source: "agent", message: "", calls: ["Read#call_1"] },
      {
        source: "agent",
        message: "",
        calls: ["Read#late"],
        results: ["late output"],
      },
      { source: "agent", message: "Done.", promptTokens: 5 },
    ]);
  });

  it("looks for a thought's message only in the turn hooks started in", () => {
    const steps = merge(
      [
        user("one"),
        assistant("Earlier.", [], { reasoningRedacted: true }),
        user("two"),
        assistant("Later.", ["Read"], { reasoningRedacted: true }),
      ],
      [thought("Read it."), tool("Read", "r")],
    );
    expect(steps.slice(1)).toEqual([
      { source: "agent", message: "Earlier." },
      { source: "user", message: "two" },
      {
        source: "agent",
        message: "Later.",
        reasoning: "Read it.",
        calls: ["Read#r"],
        results: ["r output"],
      },
    ]);
  });

  it("adds what hooks saw but a lagging transcript hasn't written yet", () => {
    const steps = merge(
      [user("fix it"), assistant("Looking.", ["Grep"])],
      [
        prompt("fix it"),
        tool("Grep", "g1"),
        thought("Now edit."),
        tool("StrReplace", "e1"),
        response("Fixed."),
      ],
    );
    expect(steps).toEqual([
      { source: "user", message: "fix it" },
      {
        source: "agent",
        message: "Looking.",
        calls: ["Grep#g1"],
        results: ["g1 output"],
      },
      {
        source: "agent",
        message: "",
        reasoning: "Now edit.",
        calls: ["StrReplace#e1"],
        results: ["e1 output"],
      },
      { source: "agent", message: "Fixed." },
    ]);
  });

  it("pairs calls the transcript and hooks name differently, by position", () => {
    const steps = merge(
      [user("edit"), assistant("", ["StrReplace", "TodoWrite", "Glob"])],
      [prompt("edit"), tool("Write", "w"), tool("List", "l")],
    );
    expect(steps[1]).toEqual({
      source: "agent",
      message: "",
      calls: ["StrReplace#w", "TodoWrite#call_1", "Glob#l"],
      results: ["w output", "l output"],
    });
  });

  it("separates reasoning the transcript appended to a message's text", () => {
    const steps = merge(
      [user("why?"), assistant("Because.\n\nThe user asks why; explain.")],
      [
        prompt("why?"),
        thought("The user asks why; explain."),
        response("Because."),
      ],
    );
    expect(steps[1]).toEqual({
      source: "agent",
      message: "Because.",
      reasoning: "The user asks why; explain.",
    });
  });

  it("matches a queued prompt's turn without its own prompt event", () => {
    const steps = merge(
      [
        user("one"),
        assistant("", ["Shell"]),
        assistant("One."),
        user("two"),
        assistant("", ["Shell"]),
        assistant("Two."),
      ],
      [
        prompt("one"),
        tool("Shell", "s1"),
        response("One."),
        tool("Shell", "s2"),
        response("Two."),
      ],
    );
    expect(steps.map((step) => step.calls ?? step.message)).toEqual([
      "one",
      ["Shell#s1"],
      "One.",
      "two",
      ["Shell#s2"],
      "Two.",
    ]);
  });
});
