import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { DebugContext } from "./debug.types";

interface CreateProjectWorktreeOptions {
  debugContext: DebugContext;
  workspaceDir: string;
}

export const createProjectWorktree = (
  options: CreateProjectWorktreeOptions,
): string | undefined => {
  const { debugContext, workspaceDir } = options;
  const commitSha = debugContext.commitSha;

  const gitRoot = detectGitRoot();
  if (!gitRoot) {
    console.log(
      chalk.gray(
        "  Not inside a git repository -- skipping project repo worktree.",
      ),
    );
    return undefined;
  }

  if (!commitSha) {
    console.log(
      chalk.gray(
        "  No commit SHA available -- skipping project repo worktree.",
      ),
    );
    return undefined;
  }

  const projectRepoDir = join(workspaceDir, "project-repo");

  try {
    fetchSha(gitRoot, commitSha);
  } catch {
    // SHA may already be local or not fetchable -- that's fine
  }

  try {
    console.log(
      chalk.cyan(
        `  Creating project repo worktree at ${commitSha.slice(0, 8)}...`,
      ),
    );
    execSync(`git worktree add --detach "${projectRepoDir}" ${commitSha}`, {
      cwd: gitRoot,
      stdio: "pipe",
    });
    console.log(chalk.green(`  Project repo worktree created.`));
    return projectRepoDir;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      chalk.yellow(
        `  Warning: Could not create project repo worktree: ${message}`,
      ),
    );
    console.warn(
      chalk.yellow(
        `  You can manually check out commit ${commitSha} in your repo to inspect the code.`,
      ),
    );
    return undefined;
  }
};

export const removeProjectWorktree = (workspaceDir: string): void => {
  const projectRepoDir = join(workspaceDir, "project-repo");
  if (!existsSync(projectRepoDir)) {
    return;
  }

  const gitRoot = detectGitRoot();
  if (!gitRoot) {
    return;
  }

  try {
    execSync(`git worktree remove --force "${projectRepoDir}"`, {
      cwd: gitRoot,
      stdio: "pipe",
    });
  } catch {
    // Best-effort cleanup
  }
};

const detectGitRoot = (): string | undefined => {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
};

const fetchSha = (repoPath: string, sha: string): void => {
  execSync(`git fetch origin ${sha}`, {
    cwd: repoPath,
    stdio: "pipe",
  });
};
