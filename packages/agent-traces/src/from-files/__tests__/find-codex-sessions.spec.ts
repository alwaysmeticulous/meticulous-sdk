import { join } from "path";
import { describe, expect, it } from "vitest";
import { findTraceSessions } from "../find-trace-sessions";
import {
  CODEX_CHILD_ID,
  CODEX_ROOT_ID,
  codexRollout,
  jsonl,
  writeTree,
} from "./trace-fixtures";

const OPTIONS = { converterVersion: "test" };
const DAY_DIR = "codex-home/sessions/2026/10/09";
const rolloutName = (threadId: string) =>
  `rollout-2026-10-09T09-20-26-${threadId}.jsonl`;

describe("findTraceSessions for Codex", () => {
  it("embeds a spawned thread in its parent's session, named from the session index", async () => {
    const root = writeTree({
      [`${DAY_DIR}/${rolloutName(CODEX_ROOT_ID)}`]: codexRollout(
        CODEX_ROOT_ID,
        null,
        "Plan it",
      ),
      [`${DAY_DIR}/${rolloutName(CODEX_CHILD_ID)}`]: codexRollout(
        CODEX_CHILD_ID,
        CODEX_ROOT_ID,
        "Do it",
      ),
      "codex-home/session_index.jsonl": jsonl({
        id: CODEX_ROOT_ID,
        thread_name: "Shop plan",
      }),
    });

    const { sessions, skipped } = await findTraceSessions(
      [join(root, DAY_DIR)],
      OPTIONS,
    );

    expect(skipped).toEqual([]);
    expect(sessions.map(({ sessionId }) => sessionId)).toEqual([CODEX_ROOT_ID]);
    const payload = await sessions[0].prepare();
    expect(payload.envelope.files.map((file) => file.relativePath)).toEqual([
      `sessions/2026/10/09/${rolloutName(CODEX_ROOT_ID)}`,
      `sessions/2026/10/09/${rolloutName(CODEX_CHILD_ID)}`,
    ]);
    expect(payload.trajectory.subagent_trajectories).toHaveLength(1);
    expect(payload.stats.title).toBe("Shop plan");
  });

  it("uploads a spawned thread on its own when its parent isn't given", async () => {
    const root = writeTree({
      [rolloutName(CODEX_CHILD_ID)]: codexRollout(
        CODEX_CHILD_ID,
        CODEX_ROOT_ID,
        "Do it",
      ),
    });

    const { sessions } = await findTraceSessions([root], OPTIONS);

    expect(sessions.map(({ sessionId }) => sessionId)).toEqual([
      CODEX_CHILD_ID,
    ]);
    const payload = await sessions[0].prepare();
    expect(payload.envelope.files.map((file) => file.relativePath)).toEqual([
      rolloutName(CODEX_CHILD_ID),
    ]);
    expect(payload.stats.title).toBe("Do it");
  });

  it("keeps one copy of a rollout seen twice", async () => {
    const rollout = codexRollout(CODEX_ROOT_ID, null, "Plan it");
    const root = writeTree({
      [`a/${rolloutName(CODEX_ROOT_ID)}`]: rollout,
      [`b/${rolloutName(CODEX_ROOT_ID)}`]: rollout,
    });

    const { sessions, skipped } = await findTraceSessions([root], OPTIONS);

    expect(sessions).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });
});
