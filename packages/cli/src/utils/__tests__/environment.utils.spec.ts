import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLikelyRunByAgent } from "../environment.utils";

const AGENT_ENV_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_CHILD_SESSION",
  "CODEX_THREAD_ID",
  "CODEX_CI",
  "CODEX_SANDBOX",
  "CURSOR_AGENT",
  "CURSOR_EXTENSION_HOST_ROLE",
  "CURSOR_TRACE_ID",
];

describe("isLikelyRunByAgent", () => {
  const originalIsTTYDescriptor = Object.getOwnPropertyDescriptor(
    process.stderr,
    "isTTY",
  );

  const setStderrIsTTY = (value: boolean | undefined) => {
    Object.defineProperty(process.stderr, "isTTY", {
      value,
      configurable: true,
      writable: true,
    });
  };

  beforeEach(() => {
    for (const name of AGENT_ENV_VARS) {
      vi.stubEnv(name, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalIsTTYDescriptor) {
      Object.defineProperty(process.stderr, "isTTY", originalIsTTYDescriptor);
    } else {
      delete (process.stderr as { isTTY?: boolean }).isTTY;
    }
  });

  it("is false for a human at a terminal", () => {
    setStderrIsTTY(true);
    expect(isLikelyRunByAgent()).toBe(false);
  });

  it("is true when stderr isn't a terminal", () => {
    setStderrIsTTY(undefined);
    expect(isLikelyRunByAgent()).toBe(true);
  });

  it.each([
    ["CLAUDE_CODE_CHILD_SESSION", "1"],
    ["CODEX_THREAD_ID", "0199a213-81c0-7800-8aa1-bbab2a035a53"],
    ["CODEX_CI", "1"],
    ["CODEX_SANDBOX", "seatbelt"],
    ["CURSOR_AGENT", "1"],
    ["CURSOR_EXTENSION_HOST_ROLE", "agent-exec"],
  ])("is true in a terminal when %s=%s", (name, value) => {
    setStderrIsTTY(true);
    vi.stubEnv(name, value);
    expect(isLikelyRunByAgent()).toBe(true);
  });

  it.each([
    ["CLAUDECODE", "1"],
    ["CURSOR_TRACE_ID", "abc123"],
    ["CURSOR_EXTENSION_HOST_ROLE", "user"],
  ])("is false in a terminal when only %s=%s is set", (name, value) => {
    setStderrIsTTY(true);
    vi.stubEnv(name, value);
    expect(isLikelyRunByAgent()).toBe(false);
  });
});
