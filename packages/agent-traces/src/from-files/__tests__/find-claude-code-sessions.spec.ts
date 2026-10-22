import { join } from "path";
import { describe, expect, it } from "vitest";
import { findTraceSessions } from "../find-trace-sessions";
import {
  CLAUDE_SESSION_ID,
  claudeMainTranscript,
  claudeSubagentTranscript,
  writeTree,
} from "./trace-fixtures";

const OPTIONS = { converterVersion: "test" };
const PROJECT = "-Users-alice-code-shop";
const SUBAGENTS = `${PROJECT}/${CLAUDE_SESSION_ID}/subagents`;

describe("findTraceSessions for Claude Code", () => {
  it("includes the subagents on disk beside a main transcript that's given", async () => {
    const root = writeTree({
      [`${PROJECT}/${CLAUDE_SESSION_ID}.jsonl`]: claudeMainTranscript(),
      [`${SUBAGENTS}/agent-a1.jsonl`]: claudeSubagentTranscript("a1"),
      [`${SUBAGENTS}/agent-a1.meta.json`]:
        '{"agentType":"Explore","toolUseId":"t1"}',
      [`${SUBAGENTS}/agent-a2.jsonl`]: claudeSubagentTranscript("a2"),
    });

    const { sessions, skipped } = await findTraceSessions(
      [join(root, PROJECT, `${CLAUDE_SESSION_ID}.jsonl`)],
      OPTIONS,
    );

    expect(skipped).toEqual([]);
    expect(
      sessions.map(({ agent, sessionId }) => ({ agent, sessionId })),
    ).toEqual([{ agent: "claude-code", sessionId: CLAUDE_SESSION_ID }]);
    const payload = await sessions[0].prepare();
    expect(payload.envelope).toMatchObject({
      agent: "claude-code",
      projectDirName: PROJECT,
    });
    expect(payload.envelope.files.map((file) => file.relativePath)).toEqual([
      `${CLAUDE_SESSION_ID}.jsonl`,
      `${CLAUDE_SESSION_ID}/subagents/agent-a1.jsonl`,
      `${CLAUDE_SESSION_ID}/subagents/agent-a1.meta.json`,
      `${CLAUDE_SESSION_ID}/subagents/agent-a2.jsonl`,
    ]);
    expect(payload.trajectory.subagent_trajectories).toHaveLength(2);
    expect(payload.stats.totals.promptTokens).toBeGreaterThan(0);
  });

  it("groups a crawled project directory into one session", async () => {
    const root = writeTree({
      [`${PROJECT}/${CLAUDE_SESSION_ID}.jsonl`]: claudeMainTranscript(),
      [`${SUBAGENTS}/agent-a1.jsonl`]: claudeSubagentTranscript("a1"),
      [`${SUBAGENTS}/agent-a1.meta.json`]: "{}",
    });

    const { sessions, skipped } = await findTraceSessions([root], OPTIONS);

    expect(skipped).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sourcePaths).toHaveLength(3);
  });

  it("attaches a sidechain transcript given separately to its session", async () => {
    const root = writeTree({
      [`main/${CLAUDE_SESSION_ID}.jsonl`]: claudeMainTranscript(),
      "elsewhere/helper.jsonl": claudeSubagentTranscript("b7"),
    });

    const { sessions } = await findTraceSessions([root], OPTIONS);

    expect(sessions).toHaveLength(1);
    const payload = await sessions[0].prepare();
    expect(payload.envelope.files.map((file) => file.relativePath)).toContain(
      `${CLAUDE_SESSION_ID}/subagents/agent-b7.jsonl`,
    );
  });

  it("skips subagents whose main transcript isn't given", async () => {
    const root = writeTree({
      [`${SUBAGENTS}/agent-a1.jsonl`]: claudeSubagentTranscript("a1"),
      [`${SUBAGENTS}/agent-a1.meta.json`]: "{}",
    });

    const { sessions, skipped } = await findTraceSessions(
      [
        join(root, SUBAGENTS, "agent-a1.jsonl"),
        join(root, SUBAGENTS, "agent-a1.meta.json"),
      ],
      OPTIONS,
    );

    expect(sessions).toEqual([]);
    expect(skipped.map(({ reason }) => reason)).toEqual([
      `subagent of session ${CLAUDE_SESSION_ID}, whose main transcript wasn't given`,
      "describes a subagent whose transcript wasn't found",
    ]);
  });

  it("takes the session id from the lines when the file was renamed", async () => {
    const root = writeTree({
      "renamed transcript.jsonl": claudeMainTranscript(),
    });

    const { sessions } = await findTraceSessions([root], OPTIONS);

    expect(sessions.map(({ sessionId }) => sessionId)).toEqual([
      CLAUDE_SESSION_ID,
    ]);
  });
});
