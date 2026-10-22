import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIdentityResolver } from "../resolve-identity";

const write = (path: string, content: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
};

describe("createIdentityResolver", () => {
  let root: string;
  let originalHome: string | undefined;
  let originalXdg: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "at-identity-"));
    originalHome = process.env["HOME"];
    originalXdg = process.env["XDG_CONFIG_HOME"];
    process.env["HOME"] = join(root, "home");
    process.env["XDG_CONFIG_HOME"] = join(root, "xdg");
    mkdirSync(join(root, "home"), { recursive: true });
  });

  afterEach(() => {
    process.env["HOME"] = originalHome;
    process.env["XDG_CONFIG_HOME"] = originalXdg;
  });

  const createRepo = () => {
    const repo = join(root, "home", "work", "shop");
    write(
      join(repo, ".git", "config"),
      '[remote "origin"]\n\turl = https://bob:tok@github.com/acme/shop.git\n',
    );
    return repo;
  };

  it("reads the remote from a worktree's common dir and strips credentials", () => {
    const repo = createRepo();
    const worktree = join(root, "home", "trees", "feature");
    const worktreeGitDir = join(repo, ".git", "worktrees", "feature");
    write(join(worktreeGitDir, "commondir"), "../..\n");
    write(join(worktree, ".git"), `gitdir: ${worktreeGitDir}\n`);
    mkdirSync(join(worktree, "src"), { recursive: true });

    const identity = createIdentityResolver()(join(worktree, "src"));

    expect(identity.gitRemoteUrl).toBe("https://github.com/acme/shop.git");
    expect(identity.gitRepository).toBe("github.com/acme/shop");
    expect(identity.osUsername).toBeTruthy();
  });

  it("prefers repo email, then ~/.gitconfig (with includeIf), then XDG", () => {
    const repo = createRepo();
    write(
      join(root, "xdg", "git", "config"),
      "[user]\n\temail = xdg@example.com\n",
    );
    expect(createIdentityResolver()(repo).userEmail).toBe("xdg@example.com");

    write(
      join(root, "home", ".gitconfig"),
      '[user]\n\temail = personal@example.com\n[includeIf "gitdir:~/work/"]\n\tpath = .gitconfig-work\n',
    );
    write(
      join(root, "home", ".gitconfig-work"),
      "[user]\n\temail = work@acme.com\n",
    );
    expect(createIdentityResolver()(repo).userEmail).toBe("work@acme.com");
    expect(createIdentityResolver()(root).userEmail).toBe(
      "personal@example.com",
    );

    write(join(repo, ".git", "config"), "[user]\n\temail = repo@acme.com\n");
    expect(createIdentityResolver()(repo).userEmail).toBe("repo@acme.com");
  });

  it("copes with a cwd that no longer exists", () => {
    expect(createIdentityResolver()(join(root, "gone"))).toMatchObject({
      userEmail: null,
      gitRemoteUrl: null,
    });
  });
});
