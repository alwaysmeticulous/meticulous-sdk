import { join } from "path";

export const TRY_WORKDIR = ".meticulous-try";

/** Repo-relative paths of everything `meticulous try` keeps on disk. */
export const TRY_PATHS = {
  context: join(TRY_WORKDIR, "try-context.json"),
  recipe: join(TRY_WORKDIR, "build-recipe.json"),
  candidates: join(TRY_WORKDIR, "candidate-prs.json"),
  sessions: join(TRY_WORKDIR, "sessions.json"),
  builds: join(TRY_WORKDIR, "builds"),
  worktrees: join(TRY_WORKDIR, "worktrees"),
  trash: join(TRY_WORKDIR, "trash"),
  slots: join(TRY_WORKDIR, "slots"),
  backtests: join(TRY_WORKDIR, "backtests"),
  recordingBugs: join(TRY_WORKDIR, "recording-bugs"),
  replayFix: join(TRY_WORKDIR, "replay-fix.json"),
  authState: join(TRY_WORKDIR, "auth", "storage-state.json"),
  claude: join(TRY_WORKDIR, ".claude"),
} as const;

export const absoluteTryPath = (
  repoRoot: string,
  relativePath: string,
): string => join(repoRoot, relativePath);

/** Marks the root `.gitignore` entry as ours, so `cleanup` only removes what `try` added. */
export const TRY_GITIGNORE_COMMENT = "# Meticulous try workspace";
