import { execFile } from "child_process";
import { mkdtemp, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { promisify } from "util";
import {
  AGENT_SWARM_SOURCE_BUNDLE_BASE_BRANCH,
  AGENT_SWARM_SOURCE_BUNDLE_HEAD_BRANCH,
} from "@alwaysmeticulous/client";

const execFileAsync = promisify(execFile);

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_LISTED_COMMITS = 50;
/** Fixed so the same base and head always produce the same synthetic commits. */
const SYNTHETIC_COMMIT_ENV = {
  GIT_AUTHOR_NAME: "Meticulous",
  GIT_AUTHOR_EMAIL: "noreply@meticulous.ai",
  GIT_AUTHOR_DATE: "1970-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Meticulous",
  GIT_COMMITTER_EMAIL: "noreply@meticulous.ai",
  GIT_COMMITTER_DATE: "1970-01-01T00:00:00Z",
};

export interface SourceBundle {
  path: string;
  sizeBytes: number;
  /** Full shas of the real commits whose trees the bundle holds. */
  baseSha: string;
  headSha: string;
}

/**
 * Packages the change between `baseSha` and `headSha` as a git bundle of a
 * synthetic two-commit repository: the root commit holds the base's tree and
 * its child the head's, on the `meticulous-base` / `meticulous-head`
 * branches. Diffing them gives exactly the change, both trees can be read,
 * and none of the repository's history or other branches leaves the machine.
 *
 * The commits are made in a scratch repository that borrows `repoDirectory`'s
 * objects as alternates, so nothing is written to the developer's repository
 * and no tree is copied before it is packed.
 */
export const createSourceBundle = async ({
  repoDirectory,
  baseSha,
  headSha,
  outputDirectory,
}: {
  repoDirectory: string;
  baseSha: string;
  headSha: string;
  /** Where to write the bundle; defaults to a new temporary directory. */
  outputDirectory?: string;
}): Promise<SourceBundle> => {
  const inRepo = (args: string[]) => git(args, { cwd: repoDirectory });
  const [fullBaseSha, fullHeadSha, objectsPath] = await Promise.all([
    resolveCommit(repoDirectory, baseSha),
    resolveCommit(repoDirectory, headSha),
    inRepo(["rev-parse", "--git-path", "objects"]),
  ]);
  const headMessage = await describeHead(repoDirectory, {
    baseSha: fullBaseSha,
    headSha: fullHeadSha,
  });

  const scratchDirectory = await mkdtemp(join(tmpdir(), "meticulous-source-"));
  try {
    const gitDir = join(scratchDirectory, "repo.git");
    await git(["init", "--quiet", "--bare", gitDir], { cwd: scratchDirectory });
    await writeFile(
      join(gitDir, "objects", "info", "alternates"),
      `${resolve(repoDirectory, objectsPath)}\n`,
    );
    const inScratch = (args: string[]) =>
      git(args, {
        cwd: scratchDirectory,
        env: { ...process.env, ...SYNTHETIC_COMMIT_ENV, GIT_DIR: gitDir },
      });
    const baseCommit = await inScratch([
      "commit-tree",
      "--no-gpg-sign",
      `${fullBaseSha}^{tree}`,
      "-m",
      `Base ${fullBaseSha}`,
    ]);
    const headCommit = await inScratch([
      "commit-tree",
      "--no-gpg-sign",
      `${fullHeadSha}^{tree}`,
      "-p",
      baseCommit,
      "-m",
      headMessage,
    ]);
    const baseRef = `refs/heads/${AGENT_SWARM_SOURCE_BUNDLE_BASE_BRANCH}`;
    const headRef = `refs/heads/${AGENT_SWARM_SOURCE_BUNDLE_HEAD_BRANCH}`;
    await inScratch(["update-ref", baseRef, baseCommit]);
    await inScratch(["update-ref", headRef, headCommit]);

    const bundleDirectory =
      outputDirectory ??
      (await mkdtemp(join(tmpdir(), "meticulous-source-bundle-")));
    const bundlePath = join(bundleDirectory, "source.bundle");
    await inScratch([
      "bundle",
      "create",
      "--quiet",
      bundlePath,
      baseRef,
      headRef,
    ]);
    const { size } = await stat(bundlePath);
    return {
      path: bundlePath,
      sizeBytes: size,
      baseSha: fullBaseSha,
      headSha: fullHeadSha,
    };
  } finally {
    await rm(scratchDirectory, { recursive: true, force: true });
  }
};

const resolveCommit = async (
  repoDirectory: string,
  sha: string,
): Promise<string> => {
  try {
    return await git(["rev-parse", "--verify", "--quiet", `${sha}^{commit}`], {
      cwd: repoDirectory,
    });
  } catch {
    throw new Error(
      `Commit ${sha} is not in the repository at ${repoDirectory}. Fetch it first (a shallow clone may not have it).`,
    );
  }
};

/**
 * The head commit's own message, which for a merged pull request is usually
 * its title and description, plus the subjects of any other commits in the
 * change. The worker shows it to the planner in place of a pull request.
 */
const describeHead = async (
  repoDirectory: string,
  { baseSha, headSha }: { baseSha: string; headSha: string },
): Promise<string> => {
  const message = await git(["log", "-1", "--format=%B", headSha], {
    cwd: repoDirectory,
  });
  const subjects = await git(
    [
      "log",
      "--format=%H %s",
      `--max-count=${MAX_LISTED_COMMITS + 1}`,
      `${baseSha}..${headSha}`,
    ],
    { cwd: repoDirectory },
  ).catch(() => "");
  const otherCommits = (subjects === "" ? [] : subjects.split("\n"))
    .filter((line) => !line.startsWith(`${headSha} `))
    .map((line) => line.slice(line.indexOf(" ") + 1));
  if (otherCommits.length === 0) {
    return message || `Head ${headSha}`;
  }
  return [
    message || `Head ${headSha}`,
    `Other commits in this change:\n${otherCommits
      .slice(0, MAX_LISTED_COMMITS)
      .map((subject) => `- ${subject}`)
      .join("\n")}`,
  ].join("\n\n");
};

const git = async (
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, {
    ...options,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  return stdout.trim();
};
