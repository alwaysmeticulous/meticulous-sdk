import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

export const CLAUDE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
export const CODEX_ROOT_ID = "01a11ff6-bbc1-7cf1-bc0d-28e3571825ff";
export const CODEX_CHILD_ID = "01a11ff6-bc7b-74d3-b50a-2fc52d3ef3ff";
export const PI_SESSION_ID = "01a11ff3-e855-75a4-9d86-d21d49f8a0d5";
export const CURSOR_SESSION_ID = "5c7a0d3e-1f2b-4c3d-9e8f-0a1b2c3d4e5f";
export const CURSOR_SUBAGENT_ID = "9d0e1f2a-3b4c-4d5e-8f6a-7b8c9d0e1f2a";

/** Writes `files` (relative path → contents) under a new temporary directory. */
export const writeTree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "trace-files-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
};

export const jsonl = (...records: unknown[]): string =>
  records.map((record) => JSON.stringify(record)).join("\n") + "\n";

const claudeLine = (
  sessionId: string,
  type: "user" | "assistant",
  content: string,
  extra: Record<string, unknown> = {},
) => ({
  sessionId,
  cwd: "/Users/alice/code/shop",
  type,
  uuid: `${type}-${content.length}`,
  timestamp: "2026-10-01T09:00:00.000Z",
  message:
    type === "user"
      ? { role: "user", content }
      : {
          model: "claude-opus-5-5",
          id: `msg-${content.length}`,
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: content }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
  ...extra,
});

export const claudeMainTranscript = (sessionId = CLAUDE_SESSION_ID): string =>
  jsonl(
    {
      type: "queue-operation",
      operation: "enqueue",
      timestamp: "2026-10-01T09:00:00.000Z",
      sessionId,
    },
    claudeLine(sessionId, "user", "Fix the checkout bug"),
    claudeLine(sessionId, "assistant", "Fixed it."),
  );

export const claudeSubagentTranscript = (
  agentId: string,
  sessionId = CLAUDE_SESSION_ID,
): string =>
  jsonl(
    claudeLine(sessionId, "user", "Find checkout code", {
      isSidechain: true,
      agentId,
    }),
    claudeLine(sessionId, "assistant", "It's in cart.ts.", {
      isSidechain: true,
      agentId,
    }),
  );

export const codexRollout = (
  threadId: string,
  parentId: string | null,
  prompt: string,
): string =>
  jsonl(
    {
      timestamp: "2026-10-09T09:20:26.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        ...(parentId
          ? { session_id: parentId, parent_thread_id: parentId }
          : {}),
        timestamp: "2026-10-09T09:20:26.000Z",
        cwd: "/Users/alice/code/shop",
        originator: "codex_cli_rs",
        cli_version: "0.42.0",
        source: "cli",
      },
    },
    {
      timestamp: "2026-10-09T09:20:27.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    },
    {
      timestamp: "2026-10-09T09:20:28.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Done." }],
      },
    },
  );

export const piSession = (id = PI_SESSION_ID): string =>
  jsonl(
    {
      type: "session",
      version: 3,
      id,
      timestamp: "2026-10-09T09:17:20.854Z",
      cwd: "/Users/alice/code/shop",
    },
    {
      type: "message",
      id: "m1",
      parentId: null,
      timestamp: "2026-10-09T09:17:21.000Z",
      message: { role: "user", content: "Add a notes file" },
    },
  );

export const cursorTranscript = (prompt: string): string =>
  jsonl(
    {
      role: "user",
      message: {
        content: [
          { type: "text", text: `<user_query>\n${prompt}\n</user_query>` },
        ],
      },
    },
    {
      role: "assistant",
      message: { content: [{ type: "text", text: "Done." }] },
    },
    { type: "turn_ended", status: "success" },
  );

export const openCodeExport = (
  id: string,
  parentId: string | null,
  prompt: string,
): string =>
  JSON.stringify({
    info: {
      id,
      ...(parentId ? { parentID: parentId } : {}),
      title: prompt,
      directory: "/Users/alice/code/shop",
      time: { created: 1791464460000, updated: 1791464470000 },
    },
    messages: [
      {
        info: {
          id: `msg_${id}`,
          sessionID: id,
          role: "user",
          time: { created: 1791464460000 },
        },
        parts: [{ id: `prt_${id}`, type: "text", text: prompt }],
      },
    ],
  });

export const atifDocument = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schema_version: "ATIF-v1.7",
  session_id: "atif-session-1",
  agent: { name: "Some Harness", version: "1.2.3", model_name: "model-x" },
  steps: [
    {
      step_id: 1,
      timestamp: "2026-10-01T09:00:00.000Z",
      source: "user",
      message: "Summarise the logs",
    },
    {
      step_id: 2,
      timestamp: "2026-10-01T09:00:05.000Z",
      source: "agent",
      model_name: "model-x",
      message: "Reading them.",
      tool_calls: [
        {
          tool_call_id: "call-1",
          function_name: "mcp__crm__lookup",
          arguments: { id: 1 },
        },
      ],
      observation: {
        results: [{ source_call_id: "call-1", content: "ACME CORP" }],
      },
      metrics: { prompt_tokens: 100, completion_tokens: 20, cached_tokens: 50 },
    },
  ],
  extra: { cwd: "/Users/alice/code/shop", gitBranch: "main" },
  ...overrides,
});
