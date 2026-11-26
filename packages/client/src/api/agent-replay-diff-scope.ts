/**
 * The project and test run a replay-diff-scoped request says the replay diff
 * belongs to. Both are optional, since the replay diff ID already determines
 * them; the backend only checks them, rejecting a mismatch with HTTP 400 and
 * reason `project-mismatch`.
 */
export interface ReplayDiffScopeOptions {
  project?: string | undefined;
  testRunId?: string | undefined;
}

export const replayDiffScopeParams = ({
  project,
  testRunId,
}: ReplayDiffScopeOptions): Record<string, string> => ({
  ...(project ? { project } : {}),
  ...(testRunId ? { testRunId } : {}),
});
