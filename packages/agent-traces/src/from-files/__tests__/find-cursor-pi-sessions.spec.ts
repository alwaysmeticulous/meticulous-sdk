import { join } from "path";
import { describe, expect, it } from "vitest";
import { findTraceSessions } from "../find-trace-sessions";
import {
  CURSOR_SESSION_ID,
  CURSOR_SUBAGENT_ID,
  cursorTranscript,
  PI_SESSION_ID,
  piSession,
  writeTree,
} from "./trace-fixtures";

const OPTIONS = { converterVersion: "test" };
const TRANSCRIPTS = "projects/Users-alice-code-shop/agent-transcripts";
const CONVERSATION = `${TRANSCRIPTS}/${CURSOR_SESSION_ID}`;

describe("findTraceSessions for Cursor", () => {
  it("includes the subagent transcripts beside a conversation", async () => {
    const root = writeTree({
      [`${CONVERSATION}/${CURSOR_SESSION_ID}.jsonl`]:
        cursorTranscript("Add notes"),
      [`${CONVERSATION}/subagents/${CURSOR_SUBAGENT_ID}.jsonl`]:
        cursorTranscript("Review"),
    });

    const { sessions, skipped } = await findTraceSessions(
      [join(root, CONVERSATION, `${CURSOR_SESSION_ID}.jsonl`)],
      OPTIONS,
    );

    expect(skipped).toEqual([]);
    expect(sessions.map(({ agent, sessionId }) => [agent, sessionId])).toEqual([
      ["cursor", CURSOR_SESSION_ID],
    ]);
    const payload = await sessions[0].prepare();
    expect(payload.envelope.projectDirName).toBe("Users-alice-code-shop");
    expect(payload.envelope.files.map((file) => file.relativePath)).toEqual([
      `Users-alice-code-shop/agent-transcripts/${CURSOR_SESSION_ID}/${CURSOR_SESSION_ID}.jsonl`,
      `Users-alice-code-shop/agent-transcripts/${CURSOR_SESSION_ID}/subagents/${CURSOR_SUBAGENT_ID}.jsonl`,
    ]);
    expect(payload.stats.title).toBe("Add notes");
  });

  it("reads legacy text transcripts kept anywhere", async () => {
    const root = writeTree({
      "legacy-0001.txt":
        "user:\n<user_query>\nExplain the build\n</user_query>\n\nassistant:\nIt uses esbuild.\n",
    });

    const { sessions } = await findTraceSessions([root], OPTIONS);

    const payload = await sessions[0].prepare();
    expect(payload.envelope.files.map((file) => file.relativePath)).toEqual([
      "transcript/legacy-0001.txt",
    ]);
    expect(payload.trajectory.steps.length).toBeGreaterThan(0);
  });

  it("skips a subagent transcript given without its conversation", async () => {
    const root = writeTree({
      [`${CONVERSATION}/subagents/${CURSOR_SUBAGENT_ID}.jsonl`]:
        cursorTranscript("Review"),
    });

    const { sessions, skipped } = await findTraceSessions([root], OPTIONS);

    expect(sessions).toEqual([]);
    expect(skipped[0]?.reason).toContain(CURSOR_SESSION_ID);
  });
});

describe("findTraceSessions for Pi", () => {
  it("uploads each session file under its header's id", async () => {
    const root = writeTree({
      [`--Users-alice-code-shop--/2026-10-09T09-17-20-854Z_${PI_SESSION_ID}.jsonl`]:
        piSession(),
      "custom/2026-10-09T09-30-00-000Z_custom.id.jsonl": piSession("custom.id"),
    });

    const { sessions } = await findTraceSessions([root], OPTIONS);

    expect(sessions.map(({ sessionId }) => sessionId).sort()).toEqual([
      PI_SESSION_ID,
      "custom-id",
    ]);
    const payload = await sessions
      .find((s) => s.sessionId === PI_SESSION_ID)!
      .prepare();
    expect(payload.envelope).toMatchObject({
      agent: "pi",
      projectDirName: "--Users-alice-code-shop--",
    });
    expect(payload.stats.cwd).toBe("/Users/alice/code/shop");
  });
});
