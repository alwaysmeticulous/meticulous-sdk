import { describe, expect, it } from "vitest";
import {
  createToolOutputFilter,
  EXCLUDED_TOOL_OUTPUT,
} from "../../tool-output-exclusion/tool-output-filter";
import { stripDevinToolOutputs } from "../strip-devin-tool-outputs";

const file = (payload: unknown) => {
  const content = JSON.stringify({ version: 1, event: "PostToolUse", payload });
  return {
    relativePath: "1-x.json",
    mtimeMs: 1,
    sizeBytes: Buffer.byteLength(content),
    content,
  };
};

describe("stripDevinToolOutputs", () => {
  it("strips PostToolUse responses of excluded tools by name", () => {
    const [excluded, kept, unparseable] = stripDevinToolOutputs(
      [
        file({
          hook_event_name: "PostToolUse",
          tool_name: "mcp__crm__lookup",
          tool_input: { id: 7 },
          tool_response: { success: true, rows: ["ACME CORP"] },
        }),
        file({
          hook_event_name: "PostToolUse",
          tool_name: "exec",
          tool_response: { success: true, output: "ok" },
        }),
        { relativePath: "2-y.json", mtimeMs: 1, sizeBytes: 3, content: "{no" },
      ],
      createToolOutputFilter([/^mcp__crm__/], new Set()),
    );
    expect(
      (JSON.parse(excluded?.content ?? "") as { payload: unknown }).payload,
    ).toEqual({
      hook_event_name: "PostToolUse",
      tool_name: "mcp__crm__lookup",
      tool_input: { id: 7 },
      tool_response: EXCLUDED_TOOL_OUTPUT,
    });
    expect(excluded?.sizeBytes).toBe(
      Buffer.byteLength(excluded?.content ?? ""),
    );
    expect(kept?.content).toContain('"output":"ok"');
    expect(unparseable?.content).toBe("{no");
  });
});
