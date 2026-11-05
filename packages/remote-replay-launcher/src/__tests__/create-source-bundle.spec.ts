import { execFile } from "child_process";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSourceBundle } from "../source-bundle/create-source-bundle";

const execFileAsync = promisify(execFile);

const git = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  return stdout.trim();
};

describe("createSourceBundle", () => {
  let root: string;
  let repo: string;
  let baseSha: string;
  let headSha: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "source-bundle-spec-"));
    repo = join(root, "repo");
    await mkdir(join(repo, "src"), { recursive: true });
    await git(repo, ["init", "--quiet", "-b", "main"]);
    await writeFile(join(repo, "src", "app.ts"), "export const a = 1;\n");
    await writeFile(join(repo, "removed.txt"), "gone\n");
    await git(repo, ["add", "-A"]);
    await git(repo, ["commit", "--quiet", "-m", "Base commit"]);
    baseSha = await git(repo, ["rev-parse", "HEAD"]);
    await writeFile(join(repo, "src", "app.ts"), "export const a = 2;\n");
    await git(repo, ["rm", "--quiet", "removed.txt"]);
    await git(repo, ["commit", "--quiet", "-am", "Intermediate commit"]);
    await writeFile(join(repo, "added.ts"), "export const b = 1;\n");
    await git(repo, ["add", "-A"]);
    await git(repo, [
      "commit",
      "--quiet",
      "-m",
      "Add the b export\n\nBecause the app needs it.",
    ]);
    headSha = await git(repo, ["rev-parse", "HEAD"]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("bundles the base and head trees as two commits whose diff is the change", async () => {
    const bundle = await createSourceBundle({
      repoDirectory: repo,
      baseSha: baseSha.slice(0, 10),
      headSha,
      outputDirectory: root,
    });

    expect(bundle).toMatchObject({ baseSha, headSha });
    const clone = join(root, "clone");
    await git(root, [
      "clone",
      "--quiet",
      "--branch",
      "meticulous-head",
      bundle.path,
      clone,
    ]);
    expect(
      await git(clone, [
        "diff",
        "--name-status",
        "origin/meticulous-base",
        "HEAD",
      ]),
    ).toBe("A\tadded.ts\nD\tremoved.txt\nM\tsrc/app.ts");
    expect(await git(clone, ["rev-list", "--count", "HEAD"])).toBe("2");
    const message = await git(clone, ["log", "-1", "--format=%B", "HEAD"]);
    expect(message).toContain("Add the b export");
    expect(message).toContain("Because the app needs it.");
    expect(message).toContain("- Intermediate commit");
    expect(message).not.toContain("- Add the b export");
  });

  it("reads a linked worktree's objects from its main repository", async () => {
    const worktree = join(root, "worktree");
    await git(repo, [
      "worktree",
      "add",
      "--quiet",
      "--detach",
      worktree,
      headSha,
    ]);

    const bundle = await createSourceBundle({
      repoDirectory: worktree,
      baseSha,
      headSha,
      outputDirectory: root,
    });

    expect(bundle.headSha).toBe(headSha);
    expect(await git(root, ["bundle", "list-heads", bundle.path])).toContain(
      "refs/heads/meticulous-base",
    );
  });

  it("leaves the developer's repository untouched", async () => {
    const refsBefore = await git(repo, ["for-each-ref"]);

    await createSourceBundle({
      repoDirectory: repo,
      baseSha,
      headSha,
      outputDirectory: root,
    });

    expect(await git(repo, ["for-each-ref"])).toBe(refsBefore);
  });

  it("names a commit the checkout lacks", async () => {
    await expect(
      createSourceBundle({
        repoDirectory: repo,
        baseSha: "f".repeat(40),
        headSha,
        outputDirectory: root,
      }),
    ).rejects.toThrow("is not in the repository");
  });
});
