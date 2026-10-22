import type { CodexSessionMeta } from "./parse-session-meta";

export interface CodexThreadMetadata {
  /** From the thread's first rollout file. */
  meta: CodexSessionMeta | null;
  /** The newest Codex version that wrote to the thread. */
  cliVersion: string | null;
  cwd: string | null;
  /** In the order first seen; Codex records the branch when a rollout file is created. */
  gitBranches: string[];
  /** e.g. `default`, `plan`. */
  collaborationModes: string[];
  startedAt: string | null;
  endedAt: string | null;
  malformedLineCount: number;
}

export const createEmptyMetadata = (): CodexThreadMetadata => ({
  meta: null,
  cliVersion: null,
  cwd: null,
  gitBranches: [],
  collaborationModes: [],
  startedAt: null,
  endedAt: null,
  malformedLineCount: 0,
});

export const recordSessionMeta = (
  metadata: CodexThreadMetadata,
  meta: CodexSessionMeta,
): void => {
  metadata.meta ??= meta;
  metadata.cliVersion = meta.cliVersion ?? metadata.cliVersion;
  metadata.cwd ??= meta.cwd;
  if (meta.gitBranch && !metadata.gitBranches.includes(meta.gitBranch)) {
    metadata.gitBranches.push(meta.gitBranch);
  }
};

export const recordTimestamp = (
  metadata: CodexThreadMetadata,
  timestamp: string | null,
): void => {
  if (!timestamp) {
    return;
  }
  if (!metadata.startedAt || timestamp < metadata.startedAt) {
    metadata.startedAt = timestamp;
  }
  if (!metadata.endedAt || timestamp > metadata.endedAt) {
    metadata.endedAt = timestamp;
  }
};
