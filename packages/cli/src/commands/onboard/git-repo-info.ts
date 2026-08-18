import { execSync } from "child_process";
import type { OnboardContextJson } from "./materialize-workspace";

export const assertGitRepo = (projectRoot: string): void => {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: projectRoot,
      stdio: "ignore",
    });
  } catch {
    throw new Error(
      `${projectRoot} is not a git repository. Run this from your app repo (or pass --cwd).`,
    );
  }
};

export const detectRepoUrl = (projectRoot: string): string | null => {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: projectRoot,
      encoding: "utf8",
      // A missing remote is handled below; keep git's error off our output.
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return url ? sanitizeRepoUrl(url) : null;
  } catch {
    return null;
  }
};

/**
 * Strip credentials embedded in a git remote URL (HTTPS userinfo / PATs) so
 * the value is safe to put in onboard context handed to external model tooling.
 * SCP-style SSH remotes (`git@host:path`) are left unchanged.
 */
export const sanitizeRepoUrl = (repoUrl: string): string => {
  if (!repoUrl.includes("://")) {
    return repoUrl;
  }

  try {
    const parsed = new URL(repoUrl);
    if (!parsed.username && !parsed.password) {
      return repoUrl;
    }
    parsed.username = "";
    parsed.password = "";
    // URL serializes an empty path as "/", which remotes usually omit.
    return parsed.toString().replace(/\/$/, "") || repoUrl;
  } catch {
    // Fallback for odd remotes the URL parser rejects: drop userinfo only.
    return repoUrl.replace(/^(https?:\/\/)[^/@]+@/i, "$1");
  }
};

export const detectCiProvider = (
  repoUrl: string | null,
): OnboardContextJson["ciProvider"] => {
  if (!repoUrl) {
    return "unknown";
  }
  if (/github\.com/i.test(repoUrl)) {
    return "github-actions";
  }
  if (/gitlab\.com/i.test(repoUrl) || /gitlab\./i.test(repoUrl)) {
    return "gitlab-ci";
  }
  if (/bitbucket\.org/i.test(repoUrl) || /bitbucket\./i.test(repoUrl)) {
    return "bitbucket-pipelines";
  }
  return "unknown";
};

export const parseGitHubRepo = (
  repoUrl: string,
): { owner: string; repo: string } | null => {
  const ssh = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (ssh) {
    return { owner: ssh[1], repo: ssh[2] };
  }
  return null;
};
