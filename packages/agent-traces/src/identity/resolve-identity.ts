import { hostname, homedir, release, userInfo } from "os";
import { join } from "path";
import { detectEnvironment } from "./detect-environment";
import { findGitDirs } from "./find-git-dirs";
import { normalizeGitRemoteUrl } from "../git/normalize-git-remote-url";
import { getLastGitConfigValue } from "./parse-git-config";
import { readGitConfig } from "./read-git-config";
import { stripUrlCredentials } from "./strip-url-credentials";

export interface Identity {
  userEmail: string | null;
  gitRemoteUrl: string | null;
  gitRepository: string | null;
  osUsername: string | null;
  hostname: string | null;
  platform: string;
  osRelease: string | null;
  timeZone: string | null;
  environment: string;
  environmentId: string | null;
}

/** Sessions from the same directory share an identity, so cache per cwd. */
export const createIdentityResolver = (): ((
  cwd: string | null,
) => Identity) => {
  const cache = new Map<string, Identity>();
  return (cwd) => {
    const key = cwd ?? "";
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const identity = resolveIdentity(cwd);
    cache.set(key, identity);
    return identity;
  };
};

const resolveIdentity = (cwd: string | null): Identity => {
  const gitDirs = cwd ? findGitDirs(cwd) : null;
  const conditionDirs = gitDirs ? [gitDirs.gitDir, gitDirs.commonDir] : [];
  const repoEntries = gitDirs
    ? [
        ...readGitConfig(join(gitDirs.commonDir, "config"), conditionDirs),
        ...readGitConfig(
          join(gitDirs.gitDir, "config.worktree"),
          conditionDirs,
        ),
      ]
    : [];
  const remoteUrl = getLastGitConfigValue(
    repoEntries,
    "remote",
    "origin",
    "url",
  );
  return {
    userEmail: resolveUserEmail(repoEntries, conditionDirs),
    gitRemoteUrl: remoteUrl ? stripUrlCredentials(remoteUrl) : null,
    gitRepository: remoteUrl ? normalizeGitRemoteUrl(remoteUrl) : null,
    osUsername: safely(() => userInfo().username),
    hostname: safely(() => hostname()),
    platform: process.platform,
    osRelease: safely(() => release()),
    timeZone: safely(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    ...detectEnvironment(process.env),
  };
};

/** Repo config, then `~/.gitconfig`, then the XDG config, as git does. */
const resolveUserEmail = (
  repoEntries: ReturnType<typeof readGitConfig>,
  conditionDirs: string[],
): string | null => {
  const xdgConfigHome =
    process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
  const candidates = [
    () => repoEntries,
    () => readGitConfig(join(homedir(), ".gitconfig"), conditionDirs),
    () => readGitConfig(join(xdgConfigHome, "git", "config"), conditionDirs),
  ];
  for (const readEntries of candidates) {
    const email = getLastGitConfigValue(readEntries(), "user", null, "email");
    if (email) {
      return email;
    }
  }
  return null;
};

const safely = (read: () => string): string | null => {
  try {
    return read() || null;
  } catch {
    return null;
  }
};
