export interface ParsedPullRequestUrl {
  /** Lowercased `host/owner/repo`, matching `normalizeGitRemoteUrl` once lowercased. */
  repository: string;
  number: number;
}

/**
 * GitHub `/pull/N`, GitLab `/-/merge_requests/N` (including subgroups) and
 * Bitbucket `/pull-requests/N`. Requiring digits skips GitHub's
 * `/pull/new/<branch>` link printed by `git push`.
 */
const PULL_REQUEST_URL_REGEX =
  /https?:\/\/([A-Za-z0-9.-]+)(?::\d+)?\/([\w.~-]+(?:\/[\w.~-]+)+?)(?:\/-)?\/(?:pull|merge_requests|pull-requests)\/(\d{1,9})(?!\d)/g;

export const findPullRequestUrls = (text: string): ParsedPullRequestUrl[] => {
  const results: ParsedPullRequestUrl[] = [];
  for (const match of text.matchAll(PULL_REQUEST_URL_REGEX)) {
    const [, host, path, number] = match;
    if (host && path && number) {
      results.push({
        repository: `${host}/${path}`.toLowerCase(),
        number: Number(number),
      });
    }
  }
  return results;
};

export const parsePullRequestUrl = (url: string): ParsedPullRequestUrl | null =>
  findPullRequestUrls(url)[0] ?? null;
