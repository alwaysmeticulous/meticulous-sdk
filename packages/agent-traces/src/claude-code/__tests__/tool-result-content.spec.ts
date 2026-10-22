import { describe, expect, it } from "vitest";
import { convertTranscript } from "../convert-transcript";
import { MAX_OBSERVATION_CONTENT_CHARS } from "../../atif/truncate-observation-content";

const line = (value: unknown) => JSON.stringify(value);

describe("tool result content", () => {
  it("truncates oversized observations in the ATIF only", () => {
    const huge = "x".repeat(MAX_OBSERVATION_CONTENT_CHARS + 10);
    const text = [
      line({
        type: "assistant",
        message: {
          id: "msg_1",
          model: "claude-opus-5-5",
          content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
      line({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [{ type: "tool_reference", tool_name: "Read" }, huge],
            },
          ],
        },
      }),
    ].join("\n");

    const { trajectory } = convertTranscript({
      text,
      sessionId: "s",
      trajectoryId: null,
      extra: {},
    });

    const result = trajectory.steps[0]?.observation?.results[0];
    expect(typeof result?.content === "string" && result.content.length).toBe(
      MAX_OBSERVATION_CONTENT_CHARS + "\n[truncated]".length,
    );
    expect(result?.content).toMatch(/^\[tool_reference: Read\]\nxxx/);
    expect(result?.extra).toEqual({
      is_error: false,
      truncated: true,
      original_length_chars: "[tool_reference: Read]\n".length + huge.length,
    });
  });
});
