import { writeFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { gunzipSync } from "zlib";
import { EXCLUDED_TOOL_OUTPUT } from "../../tool-output-exclusion/tool-output-filter";
import { prepareSessionUpload } from "../../upload/prepare-session-upload";
import { findTraceSessions } from "../find-trace-sessions";
import {
  atifDocument,
  CLAUDE_SESSION_ID,
  claudeMainTranscript,
  writeTree,
} from "./trace-fixtures";

const OPTIONS = { converterVersion: "test" };

const findOne = async (
  document: unknown,
  agentOverride: "other" | null = null,
) => {
  const root = writeTree({ "trajectory.atif.json": JSON.stringify(document) });
  const { sessions } = await findTraceSessions([root], {
    ...OPTIONS,
    agentOverride,
  });
  expect(sessions).toHaveLength(1);
  return sessions[0];
};

describe("findTraceSessions for ATIF", () => {
  it("uploads a trajectory from an unknown harness as other, verbatim", async () => {
    const session = await findOne(atifDocument());

    expect(session).toMatchObject({
      agent: "other",
      sessionId: "atif-session-1",
    });
    const payload = await session.prepare();
    expect(payload.envelope).toMatchObject({
      agent: "other",
      rawFormat: "atif",
      projectDirName: null,
    });
    expect(JSON.parse(payload.envelope.files[0].content)).toEqual(
      atifDocument(),
    );
    expect(payload.stats).toMatchObject({
      cwd: "/Users/alice/code/shop",
      gitBranch: "main",
      agentVersion: "1.2.3",
      models: ["model-x"],
      stepCount: 2,
      title: "Summarise the logs",
      startedAt: "2026-10-01T09:00:00.000Z",
      endedAt: "2026-10-01T09:00:05.000Z",
    });
  });

  it.each([
    ["Claude Code", "claude-code"],
    ["claude_code", "claude-code"],
    ["codex", "codex"],
    ["Windsurf", "other"],
  ])("maps agent name %j to %s", async (name, agent) => {
    const session = await findOne(
      atifDocument({ agent: { name, version: "1" } }),
    );
    expect(session.agent).toBe(agent);
  });

  it("forces other with the agent override", async () => {
    const session = await findOne(
      atifDocument({ agent: { name: "codex", version: "1" } }),
      "other",
    );
    expect(session.agent).toBe("other");
  });

  it("makes an invalid session id usable, else falls back to the file name", async () => {
    expect(
      (await findOne(atifDocument({ session_id: "run 1/a" }))).sessionId,
    ).toBe("run-1-a");
    expect(
      (await findOne(atifDocument({ session_id: undefined }))).sessionId,
    ).toBe("trajectory-atif");
  });

  it("rejects an invalid trajectory with the reason", async () => {
    const session = await findOne(
      atifDocument({ steps: [{ step_id: 1, source: "robot", message: "" }] }),
    );
    await expect(session.prepare()).rejects.toThrow(
      'steps[0].source must be "system", "user" or "agent"',
    );
  });

  it("excludes tool outputs from the raw file as well as the trajectory", async () => {
    const session = await findOne(atifDocument());

    const prepared = await prepareSessionUpload(await session.prepare(), [
      /^mcp__crm__/,
    ]);

    const raw = gunzipSync(prepared.rawGzipped).toString("utf8");
    expect(prepared.atifJson).not.toContain("ACME CORP");
    expect(prepared.atifJson).toContain(EXCLUDED_TOOL_OUTPUT);
    expect(raw).not.toContain("ACME CORP");
    expect(raw).toContain(EXCLUDED_TOOL_OUTPUT);
  });

  it("round-trips a session it converted to the same agent and id", async () => {
    const root = writeTree({
      [`p/${CLAUDE_SESSION_ID}.jsonl`]: claudeMainTranscript(),
    });
    const [converted] = (await findTraceSessions([root], OPTIONS)).sessions;
    const atifPath = join(root, "exported.json");
    writeFileSync(
      atifPath,
      JSON.stringify((await converted.prepare()).trajectory),
    );

    const { sessions } = await findTraceSessions([atifPath], OPTIONS);

    expect(sessions.map(({ agent, sessionId }) => [agent, sessionId])).toEqual([
      ["claude-code", CLAUDE_SESSION_ID],
    ]);
  });

  it("skips an export of a session that's also given in its own format", async () => {
    const root = writeTree({
      [`p/${CLAUDE_SESSION_ID}.jsonl`]: claudeMainTranscript(),
    });
    const [converted] = (await findTraceSessions([root], OPTIONS)).sessions;
    writeFileSync(
      join(root, "exported.json"),
      JSON.stringify((await converted.prepare()).trajectory),
    );

    const { sessions, skipped } = await findTraceSessions([root], OPTIONS);

    expect(sessions.map((s) => s.sourcePaths[0])).toEqual([
      join(root, "p", `${CLAUDE_SESSION_ID}.jsonl`),
    ]);
    expect(skipped.map(({ path }) => path)).toEqual([
      join(root, "exported.json"),
    ]);
  });
});
