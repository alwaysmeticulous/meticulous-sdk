import { exec, execFile } from "child_process";
import { initLogger } from "./logger/console-logger";

const execPromise = (command: string, cwd?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: "utf-8", cwd }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output.trim());
    });
  });
};

const execFilePromise = (
  file: string,
  args: string[],
  cwd?: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf-8", cwd }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output.trim());
    });
  });
};

const getGitRevParseHead: (cwd?: string) => Promise<string> = (cwd) => {
  return new Promise((resolve, reject) => {
    exec("git rev-parse HEAD", { encoding: "utf-8", cwd }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output);
    });
  });
};

export const getCommitSha: (
  commitSha: string | null | undefined,
  options?: { cwd?: string },
) => Promise<string> = async (commitSha_, options) => {
  if (commitSha_) {
    return commitSha_;
  }

  const logger = initLogger();

  try {
    const gitCommitSha = (await getGitRevParseHead(options?.cwd)).trim();
    return gitCommitSha;
  } catch (error) {
    // Suppress error logging if not in a git repository
    if (error instanceof Error) {
      if (error.message.startsWith("Command failed")) {
        logger.info("Notice: not running in a git repository");
        return "";
      }
    }
    logger.error(error);
    return "";
  }
};

const getGitCommitDate: (commitSha: string, cwd?: string) => Promise<string> = (
  commitSha,
  cwd,
) => {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["show", "-s", "--format=%cI", commitSha],
      { encoding: "utf-8", cwd },
      (error, output) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(output);
      },
    );
  });
};

/**
 * Computes the base SHA for local development:
 * - On main/master (or detached HEAD at main): returns HEAD sha
 * - On a branch: returns `git merge-base main HEAD` (or master if main doesn't exist)
 *
 * Returns null if not in a git repository or if computation fails.
 */
export const getLocalBaseSha = async (options?: {
  cwd?: string;
}): Promise<string | null> => {
  const logger = initLogger();
  const cwd = options?.cwd;

  let branchName: string;
  try {
    branchName = await execPromise("git rev-parse --abbrev-ref HEAD", cwd);
  } catch (error) {
    logger.info(
      `Could not determine current branch (not in a git repository?): ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }

  logger.debug(`Current branch: ${branchName}`);

  // Fetch latest remote refs so origin/main is up-to-date
  try {
    await execPromise("git fetch origin", cwd);
  } catch (error) {
    logger.warn(
      `Could not fetch from origin: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (branchName === "main" || branchName === "master" || branchName === "HEAD") {
    try {
      const headSha = await execPromise("git rev-parse HEAD", cwd);
      logger.debug(
        `On ${branchName === "HEAD" ? "detached HEAD" : branchName}, using HEAD as base SHA: ${headSha}`,
      );
      return headSha;
    } catch (error) {
      logger.warn(
        `On ${branchName === "HEAD" ? "detached HEAD" : branchName}, but could not get HEAD SHA: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  // On a branch: compute merge-base with origin/main (or origin/master).
  const baseCandidates = ["origin/main", "origin/master"];

  for (const candidate of baseCandidates) {
    try {
      const mergeBase = await execPromise(
        `git merge-base ${candidate} HEAD`,
        cwd,
      );
      logger.debug(`Computed merge-base with '${candidate}': ${mergeBase}`);
      return mergeBase;
    } catch {
      // Try next candidate
    }
  }

  logger.warn(
    "Could not compute base SHA: no 'origin/main' or 'origin/master' branch found.",
  );
  return null;
};

/**
 * Returns true if the git working tree has uncommitted changes (staged or unstaged).
 */
export const hasUncommittedChanges = async (options?: {
  cwd?: string;
}): Promise<boolean> => {
  try {
    const output = await execPromise("git status --porcelain", options?.cwd);
    return output.length > 0;
  } catch {
    return false;
  }
};


/**
 * Returns the raw `git diff` output between baseSha and either a specific commit or the working tree.
 * - If headSha is provided: `git diff baseSha headSha`
 * - If headSha is omitted: `git diff baseSha` (compares to working tree)
 */
export const getGitDiff = async (
  baseSha: string,
  headSha: string | undefined,
  options?: { cwd?: string },
): Promise<string> => {
  const args = headSha
    ? ["diff", baseSha, headSha]
    : ["diff", baseSha];
  return execFilePromise("git", args, options?.cwd);
};

export const getCommitDate: (
  commitDate: string | null | undefined,
  commitSha: string,
) => Promise<string> = async (commitDate_, commitSha) => {
  if (commitDate_) {
    return commitDate_;
  }

  const logger = initLogger();

  try {
    const gitCommitDate = (await getGitCommitDate(commitSha)).trim();
    return gitCommitDate;
  } catch (error) {
    // Suppress error logging if not in a git repository
    if (error instanceof Error) {
      if (error.message.startsWith("Command failed")) {
        logger.debug(
          "Notice: not running in a git repository (cannot get commit date)",
        );
        return "";
      }
    }
    logger.error(error);
    return "";
  }
};
