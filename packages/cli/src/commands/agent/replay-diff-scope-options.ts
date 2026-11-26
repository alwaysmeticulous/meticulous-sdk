/**
 * Optional on every replay-diff-scoped read: --replayDiffId already determines
 * both, but agents pass them anyway, as they do to most commands. Mirrors the
 * MCP tools' `project` / `testRunId` arguments.
 */
export const replayDiffScopeOptions = {
  project: {
    string: true,
    description:
      "The project the replay diff belongs to (id, 'org/proj', or simply 'proj'). Optional: --replayDiffId already determines it, so this is only checked against it.",
  },
  testRunId: {
    string: true,
    description:
      "The test run the replay diff belongs to. Optional: --replayDiffId already determines it, so this is only checked against it.",
  },
} as const;
