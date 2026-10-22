import { describe, expect, it } from "vitest";
import { collectTraceFiles } from "../collect/collect-trace-files";
import { detectTraceFile } from "../detect/detect-trace-file";
import type { FileTraceAgent } from "../file-trace-agents";
import {
  atifDocument,
  claudeMainTranscript,
  claudeSubagentTranscript,
  codexRollout,
  CODEX_ROOT_ID,
  cursorTranscript,
  jsonl,
  openCodeExport,
  piSession,
  writeTree,
} from "./trace-fixtures";

const detect = async (
  name: string,
  content: string,
  agentOverride: FileTraceAgent | null = null,
) => {
  const root = writeTree({ [name]: content });
  const { files } = await collectTraceFiles([root]);
  const [file] = files;
  return file ? detectTraceFile(file, agentOverride) : null;
};

describe("detectTraceFile", () => {
  it.each([
    ["a.jsonl", codexRollout(CODEX_ROOT_ID, null, "hi"), "codex"],
    ["b.jsonl", piSession(), "pi"],
    ["c.jsonl", cursorTranscript("hi"), "cursor"],
    ["d.jsonl", claudeMainTranscript(), "claude-code"],
    ["e.jsonl", claudeSubagentTranscript("a1"), "claude-code"],
    ["f.json", JSON.stringify(atifDocument()), "atif"],
    ["g.json", openCodeExport("ses_1", null, "hi"), "opencode"],
    [
      "agent-a1.meta.json",
      '{"agentType":"Explore"}',
      "claude-code-subagent-meta",
    ],
    [
      "h.txt",
      "user:\n<user_query>\nhi\n</user_query>\n\nassistant:\nok\n",
      "cursor",
    ],
  ])("detects %s as %s", async (name, content, format) => {
    expect((await detect(name, content))?.format).toBe(format);
  });

  it("recognises a Claude Code transcript that opens with summaries", async () => {
    const content = jsonl(
      { type: "summary", summary: "Checkout fix", leafUuid: "u1" },
      { type: "file-history-snapshot", messageId: "m1", snapshot: {} },
    );
    expect((await detect("s.jsonl", content))?.format).toBe("claude-code");
  });

  it.each([
    ["unrelated JSONL", "x.jsonl", jsonl({ level: "info", msg: "started" })],
    ["typed lines without ids", "y.jsonl", jsonl({ type: "event", data: 1 })],
    [
      "a Pi-like header with a payload",
      "z.jsonl",
      jsonl({ type: "session", id: "x", payload: {} }),
    ],
    [
      "a Codex-like header without a payload id",
      "w.jsonl",
      jsonl({ type: "session_meta", payload: {} }),
    ],
    [
      "Cursor-like lines mixed with typed ones",
      "v.jsonl",
      jsonl({ role: "user", type: "user" }),
    ],
    ["a JSON object", "config.json", '{"enabled": true}'],
    [
      "JSON that isn't ATIF",
      "steps.json",
      '{"schema_version":"v1","agent":{},"steps":[]}',
    ],
    [
      "a session id that isn't OpenCode's",
      "oc.json",
      '{"info":{"id":"abc"},"messages":[]}',
    ],
    ["invalid JSON", "broken.json", "{"],
    ["plain text", "notes.txt", "user: hello"],
    ["an empty file", "empty.jsonl", ""],
  ])("doesn't recognise %s", async (_description, name, content) => {
    expect(await detect(name, content)).toBeNull();
  });

  it("takes ids from the lines it reads", async () => {
    expect(
      await detect("e.jsonl", claudeSubagentTranscript("a1")),
    ).toMatchObject({
      sessionId: "11111111-1111-4111-8111-111111111111",
      agentId: "a1",
      isSidechain: true,
    });
    expect(
      await detect("a.jsonl", codexRollout(CODEX_ROOT_ID, null, "hi")),
    ).toMatchObject({ meta: { threadId: CODEX_ROOT_ID } });
  });

  it("with an agent override, treats files with that agent's extensions as its format", async () => {
    const lines = jsonl({ level: "info" });
    expect((await detect("x.jsonl", lines, "codex"))?.format).toBe("codex");
    expect((await detect("x.json", "{}", "other"))?.format).toBe("atif");
    expect(await detect("x.json", "{}", "codex")).toBeNull();
    expect(await detect("x.jsonl", lines, "opencode")).toBeNull();
  });
});
