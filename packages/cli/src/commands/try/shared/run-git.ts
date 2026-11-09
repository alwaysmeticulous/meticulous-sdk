import { execFile, execFileSync } from "child_process";
import { normalize, sep } from "path";
import { promisify } from "util";
import { CliUserError } from "../../../utils/cli-user-error";

const MAX_GIT_OUTPUT_BYTES = 256 * 1024 * 1024;

const execFileAsync = promisify(execFile);

/** Runs git with literal arguments (never through a shell) and returns stdout. */
export const runGit = (
  cwd: string,
  args: string[],
  env?: Record<string, string>,
): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });

export const tryRunGit = (cwd: string, args: string[]): string | null => {
  try {
    return runGit(cwd, args).trim();
  } catch {
    return null;
  }
};

/** `runGit` without blocking the event loop, so git calls can run concurrently. */
export const runGitAsync = async (
  cwd: string,
  args: string[],
): Promise<string> =>
  (
    await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    })
  ).stdout;

export const tryRunGitAsync = async (
  cwd: string,
  args: string[],
): Promise<string | null> => {
  try {
    return (await runGitAsync(cwd, args)).trim();
  } catch {
    return null;
  }
};

const TRY_WORKTREE_SEGMENT = `${sep}.meticulous-try${sep}worktrees${sep}`;

/**
 * The top level of the git checkout containing `cwd`. From inside one of the
 * try backtest worktrees this is the main checkout, so helpers run there still
 * share one `.meticulous-try/` workspace.
 */
export const resolveRepoRoot = (cwd: string): string => {
  const root = tryRunGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) {
    throw new CliUserError(
      `${cwd} is not inside a git repository. Run this from your app repo (or pass --cwd).`,
    );
  }
  const normalized = normalize(root);
  const index = normalized.indexOf(TRY_WORKTREE_SEGMENT);
  return index === -1 ? normalized : normalized.slice(0, index);
};
