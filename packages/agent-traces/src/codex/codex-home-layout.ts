/** Live sessions live under `sessions/YYYY/MM/DD`, archived ones under `archived_sessions`. */
export const CODEX_ROLLOUT_DIRS = ["sessions", "archived_sessions"] as const;

/** Codex's thread titles (`thread_name`), appended on every rename. */
export const CODEX_SESSION_INDEX_FILE = "session_index.jsonl";
