import { describe, expect, it } from "vitest";
import { parseCursorJsonlTranscript } from "../transcript/parse-cursor-jsonl-transcript";
import { parseCursorTextTranscript } from "../transcript/parse-cursor-text-transcript";

describe("parseCursorJsonlTranscript", () => {
  it("unwraps prompts, reads their timestamps and splits off redacted reasoning", () => {
    const parsed = parseCursorJsonlTranscript(
      [
        '{"type":"metadata","metadata":{"overview":"Probing tools"}}',
        '{"role":"user","message":{"content":[{"type":"text","text":"<timestamp>Monday, Aug 24, 2026, 3:01 PM (UTC-5)</timestamp>\\n<user_query>\\nls\\n</user_query>"}]}}',
        '{"role":"assistant","message":{"content":[{"type":"text","text":"Listing.\\n\\n[REDACTED]"},{"type":"tool_use","name":"Shell","input":{"command":"ls"}},{"type":"image"}]}}',
        '{"type":"turn_ended","status":"error","error":"Other Models usage limit reached"}',
      ].join("\n"),
    );
    expect(parsed).toEqual({
      overview: "Probing tools",
      malformedLineCount: 0,
      entries: [
        { kind: "user", text: "ls", timestamp: "2026-08-24T20:01:00.000Z" },
        {
          kind: "assistant",
          text: "Listing.",
          reasoning: null,
          reasoningRedacted: true,
          toolUses: [{ id: null, name: "Shell", input: { command: "ls" } }],
          otherBlockTypes: ["image"],
        },
        {
          kind: "turn_ended",
          status: "error",
          error: "Other Models usage limit reached",
        },
      ],
    });
  });

  it("skips and counts lines it can't read", () => {
    const parsed = parseCursorJsonlTranscript(
      [
        '{"role":"user","message":{"content":[{"type":"text","text":"hi"}]}}',
        '{"role":"assistant","message":{"content":[{"type":"te',
        "[1,2]",
        '{"role":"system","message":{"content":[]}}',
        '{"role":"assistant"}',
        "",
        '{"role":"assistant","message":{"content":[{"type":"tool_use"}]}}',
      ].join("\n"),
    );
    expect(parsed.malformedLineCount).toBe(4);
    expect(parsed.entries).toEqual([
      { kind: "user", text: "hi", timestamp: null },
      {
        kind: "assistant",
        text: "",
        reasoning: null,
        reasoningRedacted: false,
        toolUses: [{ id: null, name: "unknown", input: {} }],
        otherBlockTypes: [],
      },
    ]);
  });
});

describe("parseCursorTextTranscript", () => {
  it("reads older installs' role blocks, reasoning, tool calls and turn outcomes", () => {
    const parsed = parseCursorTextTranscript(
      [
        "user:",
        "<user_query>hello</user_query>",
        "",
        "A:",
        "[Thinking]private",
        "visible",
        "[Tool call] Grep",
        "  pattern: TODO",
        '  options: {"glob":"*.ts"}',
        "",
        "[Tool result] Grep",
        "",
        "Turn ended: error: rate limited",
      ].join("\n"),
    );
    expect(parsed.entries).toEqual([
      { kind: "user", text: "hello", timestamp: null },
      {
        kind: "assistant",
        text: "visible",
        reasoning: "private",
        reasoningRedacted: false,
        toolUses: [
          {
            id: null,
            name: "Grep",
            input: { pattern: "TODO", options: { glob: "*.ts" } },
          },
        ],
        otherBlockTypes: [],
      },
      { kind: "turn_ended", status: "error", error: "rate limited" },
    ]);
  });
});
