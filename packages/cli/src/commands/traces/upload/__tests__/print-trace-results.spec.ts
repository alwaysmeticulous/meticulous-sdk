import { describe, expect, it } from "vitest";
import { formatTraceResult } from "../print-trace-results";

describe("formatTraceResult", () => {
  it("names the session, its files and its outcome", () => {
    expect(
      formatTraceResult({
        agent: "codex",
        sessionId: "t1",
        sourcePaths: ["/a.jsonl", "/b.jsonl"],
        stepCount: 12,
        subagentCount: 1,
        outcome: { kind: "already-uploaded", agentTraceId: "agt_1" },
      }),
    ).toBe(
      "codex t1 (12 steps, 1 subagents) from /a.jsonl and 1 more: already uploaded (agt_1)",
    );
    expect(
      formatTraceResult({
        agent: "pi",
        sessionId: "p1",
        sourcePaths: ["/p.jsonl"],
        stepCount: null,
        subagentCount: null,
        outcome: { kind: "failed", reason: "unreadable" },
      }),
    ).toBe("pi p1 from /p.jsonl: failed: unreadable");
  });
});
