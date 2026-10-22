import { describe, expect, it } from "vitest";
import { convertPiSession } from "../convert-pi-session";
import { parsePiSession } from "../parse-pi-session";

const convertLines = (lines: string[]) =>
  convertPiSession(
    {
      sessionId: "s1",
      parsed: parsePiSession(lines.join("\n")),
      gitBranch: null,
    },
    "test-version",
  );

const line = (value: unknown) => JSON.stringify(value);

describe("convertPiSession with malformed or unusual input", () => {
  it("skips and counts unparseable lines, including a half-written last line", () => {
    const { trajectory, stats } = convertLines([
      line({ type: "session", version: 3, id: "s1", cwd: "/repo" }),
      "not json",
      line(["an", "array"]),
      line({
        type: "message",
        id: "a",
        parentId: null,
        message: { role: "user", content: "First line\nmore" },
      }),
      line({
        type: "message",
        id: "b",
        parentId: "a",
        message: { role: "assistant", content: "not an array", usage: "nope" },
      }),
      line({ type: "message", id: "c", parentId: "b", message: "no role" }),
      line({ type: "mystery", id: "d", parentId: "c" }),
      line({
        type: "message",
        id: "e",
        parentId: "d",
        message: {
          role: "toolResult",
          toolCallId: "gone",
          content: [{ type: "image", data: "", mimeType: "image/png" }],
        },
      }),
      '{"type":"message","id":"f","parentId":"e","message":{"role":"assi',
    ]);
    expect(trajectory.steps.map((step) => [step.source, step.message])).toEqual(
      [
        ["user", "First line\nmore"],
        ["agent", ""],
        ["system", ""],
      ],
    );
    expect(trajectory.steps[1]?.metrics).toBeUndefined();
    expect(trajectory.steps[2]?.observation?.results[0]?.extra).toMatchObject({
      orphan_tool_call_id: "gone",
      image_count: 1,
    });
    expect(trajectory.extra).toMatchObject({
      malformed_line_count: 3,
      unconverted_entry_types: ["mystery"],
    });
    expect(stats.title).toBe("First line");
    expect(stats.reportedCostUsd).toBeNull();
  });

  it("chains version 1 entries, which have no ids, in file order", () => {
    const { trajectory } = convertLines([
      line({
        type: "session",
        id: "s1",
        timestamp: "2025-01-01T00:00:00.000Z",
        cwd: "/repo",
      }),
      line({
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "Hi" }] },
      }),
      line({
        type: "message",
        message: {
          role: "hookMessage",
          customType: "ext",
          content: "Injected",
          display: false,
        },
      }),
      line({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Hello" },
            { type: "thinking", thinking: "", redacted: true },
          ],
        },
      }),
    ]);
    expect(trajectory.steps.map((step) => [step.source, step.message])).toEqual(
      [
        ["user", "Hi"],
        ["user", "Injected"],
        ["agent", "Hello"],
      ],
    );
    expect(trajectory.steps[1]?.extra).toMatchObject({
      origin_kind: "custom_message",
      custom_type: "ext",
      display: false,
    });
    expect(trajectory.steps[2]?.extra).toMatchObject({
      redacted_thinking_block_count: 1,
    });
    expect(trajectory.extra).toMatchObject({
      pi_session_version: 1,
      abandoned_entry_count: 0,
    });
  });

  it("handles an empty file and a file with only a header", () => {
    expect(convertLines([]).trajectory.steps).toEqual([]);
    const { stats } = convertLines([
      line({
        type: "session",
        version: 3,
        id: "s1",
        timestamp: "2025-01-01T00:00:00.000Z",
        cwd: "/repo",
      }),
    ]);
    expect(stats).toMatchObject({
      cwd: "/repo",
      title: null,
      startedAt: "2025-01-01T00:00:00.000Z",
      stepCount: 0,
    });
  });

  it("survives a parent cycle", () => {
    const { trajectory } = convertLines([
      line({
        type: "message",
        id: "a",
        parentId: "b",
        message: { role: "user", content: "One" },
      }),
      line({
        type: "message",
        id: "b",
        parentId: "a",
        message: { role: "user", content: "Two" },
      }),
    ]);
    expect(trajectory.steps.map((step) => step.message)).toEqual([
      "One",
      "Two",
    ]);
  });
});
