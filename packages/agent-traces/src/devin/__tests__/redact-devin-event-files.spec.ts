import { describe, expect, it } from "vitest";
import {
  REDACTED_ENV_VALUE,
  redactDevinEventFiles,
} from "../redact-devin-event-files";

const file = (content: string) => ({
  relativePath: "1791568951-Fq5yfE.json",
  mtimeMs: 1,
  sizeBytes: Buffer.byteLength(content, "utf8"),
  content,
});

describe("redactDevinEventFiles", () => {
  it("replaces every exec env value and re-measures the file", () => {
    const content = JSON.stringify({
      version: 1,
      event: "PostToolUse",
      payload: {
        tool_name: "exec",
        tool_input: {
          command: "ls",
          env: {
            METICULOUS_AGENT_TRACES_TOKEN: "atit-secret",
            __DEVIN_EXEC_ENV__METICULOUS_AGENT_TRACES_TOKEN: "atit-secret",
          },
        },
      },
    });

    const [redacted] = redactDevinEventFiles([file(content)]);

    expect(redacted.content).not.toContain("atit-secret");
    expect(JSON.parse(redacted.content).payload.tool_input).toEqual({
      command: "ls",
      env: {
        METICULOUS_AGENT_TRACES_TOKEN: REDACTED_ENV_VALUE,
        __DEVIN_EXEC_ENV__METICULOUS_AGENT_TRACES_TOKEN: REDACTED_ENV_VALUE,
      },
    });
    expect(redacted.sizeBytes).toBe(
      Buffer.byteLength(redacted.content, "utf8"),
    );
  });

  it("leaves files without an env, and unparseable files, untouched", () => {
    const withoutEnv = file(
      JSON.stringify({ event: "Stop", payload: { tool_input: { a: 1 } } }),
    );
    const truncated = file(
      '{"event":"PostToolUse","payload":{"tool_input":{"env"',
    );

    expect(redactDevinEventFiles([withoutEnv, truncated])).toEqual([
      withoutEnv,
      truncated,
    ]);
  });
});
