import { describe, expect, it } from "vitest";
import { AGENT_TRACE_SESSION_ID_REGEX, isAgentTraceAgent } from "../constants";

describe("AGENT_TRACE_SESSION_ID_REGEX", () => {
  it("accepts Claude Code session ids", () => {
    expect(
      AGENT_TRACE_SESSION_ID_REGEX.test("2b29f719-3506-4928-af6e-2a011a4e9c88"),
    ).toBe(true);
  });

  it("accepts OpenCode session ids", () => {
    expect(
      AGENT_TRACE_SESSION_ID_REGEX.test("ses_3a1b2c3d4e5fXyZ0123456789"),
    ).toBe(true);
  });

  it.each(["", "../etc", "a/b", "a.b", "x".repeat(129)])(
    "rejects %j",
    (value) => {
      expect(AGENT_TRACE_SESSION_ID_REGEX.test(value)).toBe(false);
    },
  );
});

describe("isAgentTraceAgent", () => {
  it("only accepts known agents", () => {
    expect(isAgentTraceAgent("claude-code")).toBe(true);
    expect(isAgentTraceAgent("devin")).toBe(true);
    expect(isAgentTraceAgent("windsurf")).toBe(false);
  });
});
