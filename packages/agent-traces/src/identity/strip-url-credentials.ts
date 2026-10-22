/**
 * Removes any userinfo from URL-style remotes (`https://user:token@host/…`
 * → `https://host/…`); tokens embedded in remotes must never be uploaded.
 * scp-style remotes (`git@host:org/repo.git`) carry no secret and are kept.
 */
export const stripUrlCredentials = (remoteUrl: string): string => {
  const trimmed = remoteUrl.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "ssh:" || url.protocol === "git+ssh:") {
      // A bare SSH username like `git` isn't a secret, but a password is.
      url.password = "";
    } else {
      url.username = "";
      url.password = "";
    }
    return url.toString();
  } catch {
    return trimmed.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
  }
};
