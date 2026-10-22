import { describe, expect, it } from "vitest";
import { resolveSessionTitle } from "../convert/resolve-session-title";
import { userMessageToStep } from "../convert/user-message-to-step";

const info = { id: "msg_1", role: "user", time: { created: 1791537436716 } };

describe("userMessageToStep", () => {
  it("uses typed text, ignoring OpenCode's synthetic context", () => {
    const step = userMessageToStep({
      info,
      parts: [
        { type: "text", text: "Fix @src/cart.ts" },
        {
          type: "file",
          mime: "text/plain",
          filename: "cart.ts",
          url: "file:///x",
        },
        { type: "text", text: "Called the Read tool", synthetic: true },
        { type: "text", text: "hidden", ignored: true },
      ],
    });
    expect(step).toEqual({
      step_id: 0,
      timestamp: "2026-10-09T09:17:16.716Z",
      source: "user",
      message: "Fix @src/cart.ts",
      extra: {
        message_id: "msg_1",
        attachments: [{ mime: "text/plain", filename: "cart.ts" }],
      },
    });
  });

  it("marks a synthetic continuation so it isn't counted as a prompt", () => {
    const step = userMessageToStep({
      info,
      parts: [
        {
          type: "text",
          text: "Continue if you have next steps",
          synthetic: true,
          metadata: { compaction_continue: true },
        },
      ],
    });
    expect(step?.extra).toMatchObject({ origin_kind: "compaction-continue" });
  });

  it("has no step for a bare compaction request", () => {
    expect(
      userMessageToStep({ info, parts: [{ type: "compaction", auto: true }] }),
    ).toBeNull();
  });
});

describe("resolveSessionTitle", () => {
  it("falls back to the first prompt while OpenCode's placeholder title remains", () => {
    const trajectory = {
      schema_version: "ATIF-v1.7" as const,
      agent: { name: "opencode", version: "1.18.35" },
      steps: [
        {
          step_id: 1,
          source: "user" as const,
          message: "Continue",
          extra: { origin_kind: "synthetic" },
        },
        {
          step_id: 2,
          source: "user" as const,
          message: "\n Fix the cart\nplease",
        },
      ],
    };
    expect(
      resolveSessionTitle(
        { title: "New session - 2026-10-09T09:17:16.604Z" },
        trajectory,
      ),
    ).toBe("Fix the cart");
    expect(resolveSessionTitle({ title: "Cart fix" }, trajectory)).toBe(
      "Cart fix",
    );
  });
});
