import { describe, expect, it } from "vitest";
import { findTraceSessions } from "../find-trace-sessions";
import { openCodeExport, writeTree } from "./trace-fixtures";

const OPTIONS = { converterVersion: "test" };

describe("findTraceSessions for OpenCode", () => {
  it("nests subagents' exports under the root session at any depth", async () => {
    const root = writeTree({
      "grandchild.json": openCodeExport("ses_c", "ses_b", "Check it"),
      "root.json": openCodeExport("ses_a", null, "Plan it"),
      "child.json": openCodeExport("ses_b", "ses_a", "Do it"),
      "orphan.json": openCodeExport("ses_x", "ses_missing", "Alone"),
    });

    const { sessions, skipped } = await findTraceSessions([root], OPTIONS);

    expect(skipped).toEqual([]);
    expect(sessions.map(({ sessionId }) => sessionId).sort()).toEqual([
      "ses_a",
      "ses_x",
    ]);
    const payload = await sessions
      .find((s) => s.sessionId === "ses_a")!
      .prepare();
    const exported = JSON.parse(payload.envelope.files[0].content) as {
      childSessions: Array<{ info: { id: string } }>;
    };
    expect(payload.envelope.files[0].relativePath).toBe("export/ses_a.json");
    expect(exported.childSessions.map(({ info }) => info.id)).toEqual([
      "ses_b",
      "ses_c",
    ]);
    expect(payload.trajectory.subagent_trajectories).toHaveLength(2);
  });

  it("rejects an export without messages when preparing it", async () => {
    const root = writeTree({
      "bad.json": '{"info":{"id":"ses_a"},"messages":[]}',
    });
    const { sessions } = await findTraceSessions([root], {
      ...OPTIONS,
      agentOverride: "opencode",
    });
    await expect(sessions[0].prepare()).resolves.toMatchObject({
      envelope: { sessionId: "ses_a" },
    });

    const broken = writeTree({ "bad.json": '{"info":{"id":"ses_b"}}' });
    const found = await findTraceSessions([broken], {
      ...OPTIONS,
      agentOverride: "opencode",
    });
    await expect(found.sessions[0].prepare()).rejects.toThrow(
      "isn't an `opencode export` file",
    );
  });
});
