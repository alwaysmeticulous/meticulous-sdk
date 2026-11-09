import { spawn } from "child_process";
import { existsSync, readdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { tryRunGit } from "../shared/run-git";
import { TRY_WORKDIR } from "../shared/try-paths";
import {
  INSTALL_INPUT_PATHSPECS,
  listChangedInstallInputs,
} from "./install-inputs";

/**
 * How a freshly created worktree's node_modules were seeded, so the caller can
 * decide whether an install is still needed.
 */
export interface NodeModulesSeed {
  /** The checkout the node_modules were copied from. */
  donorPath: string;
  /** The donor's HEAD commit at copy time. */
  donorSha: string;
  /** Worktree-relative node_modules directories that were copied. */
  copiedDirs: string[];
  /**
   * True when every found node_modules copied cleanly. The donor's install
   * inputs already matched the target commit's (seeding is skipped otherwise),
   * so a complete copy means no install is needed.
   */
  complete: boolean;
}

/** Deep enough for pnpm/yarn workspaces (e.g. packages/group/app/node_modules). */
const MAX_SCAN_DEPTH = 6;

/**
 * Copies every node_modules directory from an existing checkout (another try
 * worktree, or the user's own checkout — reading it never modifies it) into a
 * freshly created worktree, so the worktree starts from an existing install
 * instead of a cold one. Uses copy-on-write cloning where the filesystem
 * supports it (APFS, Btrfs, XFS), falling back to a regular copy.
 *
 * Only donors whose install the target commit can use as-is are considered:
 * when the install inputs (lockfiles etc.) changed between the donor's HEAD
 * and `sha`, or the donor's are dirty, an install would run anyway, and on a
 * filesystem without copy-on-write the copy would be pure cost (npm ci even
 * deletes it first).
 */
export const seedWorktreeNodeModules = async (options: {
  repoRoot: string;
  worktreePath: string;
  sha: string;
  donorCandidates: string[];
}): Promise<NodeModulesSeed | null> => {
  for (const donorPath of options.donorCandidates) {
    const donorSha = tryRunGit(donorPath, ["rev-parse", "HEAD"]);
    if (!donorSha || !donorInstallFitsTarget(options, donorPath, donorSha)) {
      continue;
    }
    const nodeModulesDirs = findNodeModulesDirs(donorPath);
    if (nodeModulesDirs.length === 0) {
      continue;
    }
    const { copiedDirs, allCopied } = await copyNodeModulesDirs({
      donorPath,
      worktreePath: options.worktreePath,
      nodeModulesDirs,
    });
    return { donorPath, donorSha, copiedDirs, complete: allCopied };
  }
  return null;
};

const donorInstallFitsTarget = (
  options: { repoRoot: string; sha: string },
  donorPath: string,
  donorSha: string,
): boolean =>
  !hasDirtyInstallInputs(donorPath) &&
  listChangedInstallInputs(options.repoRoot, donorSha, options.sha).length ===
    0;

const copyNodeModulesDirs = async (options: {
  donorPath: string;
  worktreePath: string;
  nodeModulesDirs: string[];
}): Promise<{ copiedDirs: string[]; allCopied: boolean }> => {
  const copied = await Promise.all(
    options.nodeModulesDirs.map((relativeDir) =>
      copyNodeModulesDir(options, relativeDir),
    ),
  );
  return {
    copiedDirs: options.nodeModulesDirs.filter((_, index) => copied[index]),
    allCopied: copied.every(Boolean),
  };
};

/**
 * cpSync options: copy-on-write where the filesystem supports it, and symlink
 * targets kept byte-identical (pnpm layouts are symlink forests into .pnpm /
 * the global store, and rewriting them breaks them).
 */
const COPY_SCRIPT =
  'const { cpSync, constants } = require("fs");' +
  "cpSync(process.argv[1], process.argv[2], " +
  "{ recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });";

const copyNodeModulesDir = async (
  options: { donorPath: string; worktreePath: string },
  relativeDir: string,
): Promise<boolean> => {
  const destination = join(options.worktreePath, relativeDir);
  // The containing package may not exist at the worktree's commit.
  if (!existsSync(dirname(destination)) || existsSync(destination)) {
    return false;
  }
  const copied = await copyDirInChildProcess(
    join(options.donorPath, relativeDir),
    destination,
  );
  if (!copied) {
    // A half-copied node_modules would poison later builds; the install the
    // caller runs because `complete` is false expects a missing or complete
    // directory, not a partial one.
    rmSync(destination, { recursive: true, force: true });
  }
  return copied;
};

/**
 * A synchronous copy in a child process: cpSync is many times faster than
 * fs.promises.cp over node_modules' tens of thousands of small files (no
 * per-file threadpool round trip), and the child keeps this process free to
 * run other copies and checkouts at the same time.
 */
const copyDirInChildProcess = (
  source: string,
  destination: string,
): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["-e", COPY_SCRIPT, source, destination],
      { stdio: "ignore", windowsHide: true },
    );
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });

/**
 * Donor-relative paths of every node_modules directory, without descending
 * into them (or into `.git` / the try workspace).
 */
const findNodeModulesDirs = (root: string): string[] => {
  const found: string[] = [];
  const pending: Array<{ relative: string; depth: number }> = [
    { relative: "", depth: 0 },
  ];
  for (let next = pending.pop(); next != null; next = pending.pop()) {
    const { relative, depth } = next;
    for (const entry of readEntries(join(root, relative))) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === ".git" || entry.name === TRY_WORKDIR) {
        continue;
      }
      const entryRelative = relative ? join(relative, entry.name) : entry.name;
      if (entry.name === "node_modules") {
        found.push(entryRelative);
      } else if (depth + 1 < MAX_SCAN_DEPTH) {
        pending.push({ relative: entryRelative, depth: depth + 1 });
      }
    }
  }
  return found.sort();
};

const readEntries = (path: string) => {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
};

/**
 * Whether the donor's working tree has uncommitted changes to install inputs,
 * in which case its node_modules may not match any commit and the seeded
 * worktree still needs an install.
 */
const hasDirtyInstallInputs = (donorPath: string): boolean => {
  const status = tryRunGit(donorPath, [
    "status",
    "--porcelain",
    "--",
    ...INSTALL_INPUT_PATHSPECS,
  ]);
  return status == null || status.length > 0;
};
