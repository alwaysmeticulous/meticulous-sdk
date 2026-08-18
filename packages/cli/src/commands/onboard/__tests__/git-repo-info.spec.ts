import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertGitRepo,
  detectCiProvider,
  detectRepoUrl,
  parseGitHubRepo,
  sanitizeRepoUrl,
} from "../git-repo-info";

const dirs: string[] = [];

const makeDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "onboard-git-"));
  dirs.push(dir);
  return dir;
};

const makeGitRepo = (remoteUrl?: string): string => {
  const dir = makeDir();
  execSync("git init -q", { cwd: dir, stdio: "ignore" });
  if (remoteUrl) {
    execSync(`git remote add origin ${remoteUrl}`, {
      cwd: dir,
      stdio: "ignore",
    });
  }
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("assertGitRepo", () => {
  it("accepts a git repository", () => {
    expect(() => assertGitRepo(makeGitRepo())).not.toThrow();
  });

  it("rejects a directory outside a git repository", () => {
    expect(() => assertGitRepo(makeDir())).toThrow("is not a git repository");
  });
});

describe("detectRepoUrl", () => {
  // Not a github.com url: some environments configure a global
  // `url.<...>.insteadOf` rewrite for github remotes.
  it("reads the origin remote", () => {
    const root = makeGitRepo("https://git.example.com/acme/web.git");
    expect(detectRepoUrl(root)).toBe("https://git.example.com/acme/web.git");
  });

  it("strips credentials embedded in the origin remote", () => {
    const root = makeGitRepo(
      "https://oauth2:glpat-secret-token@gitlab.com/acme/web.git",
    );
    expect(detectRepoUrl(root)).toBe("https://gitlab.com/acme/web.git");
  });

  it("returns null when there is no origin remote", () => {
    expect(detectRepoUrl(makeGitRepo())).toBeNull();
  });
});

describe("sanitizeRepoUrl", () => {
  it.each([
    [
      "https://user:ghp_secret@github.com/acme/web.git",
      "https://github.com/acme/web.git",
    ],
    [
      "https://oauth2:glpat-secret@gitlab.com/acme/web.git",
      "https://gitlab.com/acme/web.git",
    ],
    [
      "https://x-token-auth:bb_secret@bitbucket.org/acme/web.git",
      "https://bitbucket.org/acme/web.git",
    ],
    ["https://github.com/acme/web.git", "https://github.com/acme/web.git"],
    ["git@github.com:acme/web.git", "git@github.com:acme/web.git"],
  ])("sanitizes %s", (input, expected) => {
    expect(sanitizeRepoUrl(input)).toBe(expected);
  });
});

describe("detectCiProvider", () => {
  it.each([
    ["git@github.com:acme/web.git", "github-actions"],
    ["https://github.com/acme/web", "github-actions"],
    ["git@gitlab.com:acme/web.git", "gitlab-ci"],
    ["https://gitlab.acme.dev/acme/web.git", "gitlab-ci"],
    ["git@bitbucket.org:acme/web.git", "bitbucket-pipelines"],
    ["https://bitbucket.org/acme/web.git", "bitbucket-pipelines"],
  ])("maps %s to %s", (repoUrl, expected) => {
    expect(detectCiProvider(repoUrl)).toBe(expected);
  });

  it("returns unknown without a repo url", () => {
    expect(detectCiProvider(null)).toBe("unknown");
  });
});

describe("parseGitHubRepo", () => {
  it("parses ssh remotes", () => {
    expect(parseGitHubRepo("git@github.com:acme/web.git")).toEqual({
      owner: "acme",
      repo: "web",
    });
  });

  it("parses https remotes", () => {
    expect(parseGitHubRepo("https://github.com/acme/web")).toEqual({
      owner: "acme",
      repo: "web",
    });
  });

  it("returns null for non-GitHub remotes", () => {
    expect(parseGitHubRepo("git@gitlab.com:acme/web.git")).toBeNull();
  });
});
