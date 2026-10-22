/**
 * Reduces the many spellings of a remote (`git@host:owner/repo.git`,
 * `ssh://git@host/owner/repo`, `https://host/owner/repo.git`) to
 * `host/owner/repo`, so sessions in the same repository group together.
 * Returns null for local remotes, which have no host.
 */
export const normalizeGitRemoteUrl = (url: string): string | null => {
  const location = parseRemoteLocation(url.trim());
  if (!location) {
    return null;
  }
  const path = location.path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  if (!location.host || !path) {
    return null;
  }
  return `${location.host.toLowerCase()}/${path}`;
};

/** scp-like syntax: `[user@]host:path`. Two-character minimum skips `C:\`. */
const SCP_LIKE_REMOTE_REGEX = /^(?:[^@/]+@)?([^:/]{2,}):(?!\/\/)(.+)$/;

const parseRemoteLocation = (
  url: string,
): { host: string; path: string } | null => {
  if (!url.includes("://")) {
    const match = SCP_LIKE_REMOTE_REGEX.exec(url);
    return match ? { host: match[1] ?? "", path: match[2] ?? "" } : null;
  }
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, path: decodeURIComponent(parsed.pathname) };
  } catch {
    return null;
  }
};
