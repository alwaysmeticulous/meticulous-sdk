import { join } from "path";

export const TRY_WORKDIR = ".meticulous-try";

/** Repo-relative paths of everything `meticulous try` keeps on disk. */
export const TRY_PATHS = {
  context: join(TRY_WORKDIR, "try-context.json"),
  recipe: join(TRY_WORKDIR, "build-recipe.json"),
  candidates: join(TRY_WORKDIR, "candidate-prs.json"),
  sessions: join(TRY_WORKDIR, "sessions.json"),
  builds: join(TRY_WORKDIR, "builds"),
  buildOutputs: join(TRY_WORKDIR, "builds", "outputs"),
  cache: join(TRY_WORKDIR, "cache"),
  worktrees: join(TRY_WORKDIR, "worktrees"),
  trash: join(TRY_WORKDIR, "trash"),
  slots: join(TRY_WORKDIR, "slots"),
  backtests: join(TRY_WORKDIR, "backtests"),
  recordingBugs: join(TRY_WORKDIR, "recording-bugs"),
  replayFix: join(TRY_WORKDIR, "replay-fix.json"),
  authState: join(TRY_WORKDIR, "auth", "storage-state.json"),
  claude: join(TRY_WORKDIR, ".claude"),
  /**
   * The agent's own Meticulous data dir (`METICULOUS_DIR`). It holds no OAuth
   * login, so the agent's commands authenticate with the trial project's token
   * instead of the user's login and its account-wide default project.
   */
  agentDataDir: join(TRY_WORKDIR, "meticulous-home"),
  /** Sourcing it gives a shell the agent's environment (`agent-env-script.ts`). */
  agentEnvScript: join(TRY_WORKDIR, "agent-env.sh"),
} as const;

export const absoluteTryPath = (
  repoRoot: string,
  relativePath: string,
): string => join(repoRoot, relativePath);

/** Marks the root `.gitignore` entry as ours, so `cleanup` only removes what `try` added. */
export const TRY_GITIGNORE_COMMENT = "# Meticulous try workspace";
