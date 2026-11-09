import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  mkdirSafeSync,
  normalizeRelativeRepoPath,
  resolveSafeWritePath,
} from "../../onboard/safe-repo-fs";
import {
  runGit,
  runGitAsync,
  tryRunGit,
  tryRunGitAsync,
} from "../shared/run-git";
import { TRY_PATHS, absoluteTryPath } from "../shared/try-paths";
import { DEFAULT_LEASE_SECONDS, listHeldSlots } from "../slots/build-slots";
import { emptyTrashInBackground, moveToTrash } from "./discard-dirs";
import { listChangedInstallInputs } from "./install-inputs";
import { seedWorktreeNodeModules } from "./seed-node-modules";

export interface TryWorktree {
  name: string;
  path: string;
  sha: string;
  reused: boolean;
  /** The commit the worktree was switched from, or null for a new worktree. */
  previousSha: string | null;
  /**
   * Install inputs (lockfiles, package manager and Node version config,
   * patches) that differ from the checkout whose install this worktree
   * carries (`previousSha`, or the seed donor's commit for a new worktree).
   * Null when an install is always needed (a new worktree that could not be
   * seeded); empty means the existing install still fits.
   */
  installInputsChanged: string[] | null;
  /**
   * The existing checkout a new worktree's node_modules were copied from
   * (copy-on-write where the filesystem supports it), or null when nothing
   * was seeded or the worktree was reused.
   */
  seededFrom: { path: string; sha: string } | null;
}

const WORKTREE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Populate the worktree with one checkout worker per core (a value below one
 * means "as many as there are cores"). Old gits ignore unknown config keys, so
 * this degrades to a serial checkout.
 */
const PARALLEL_CHECKOUT = [
  "-c",
  "checkout.workers=0",
  "-c",
  "checkout.thresholdForParallelism=100",
];

/** The warm worktree leased together with build slot `slot` (`meticulous try slot`). */
export const slotWorktreeName = (slot: number): string => `slot-${slot}`;

/** HEAD of an existing try worktree, or null when it does not exist. */
export const tryWorktreeHeadSha = (
  repoRoot: string,
  name: string,
): string | null => {
  assertValidName(name);
  const path = worktreePath(repoRoot, name);
  return existsSync(path) ? tryRunGit(path, ["rev-parse", "HEAD"]) : null;
};

/**
 * Creates a detached worktree at `sha` under `.meticulous-try/worktrees/<name>`,
 * or switches an existing one to `sha` in place so its node_modules and build
 * caches carry over. Detached so no branch is created in the user's repo.
 * `cleanPaths` (worktree-relative, e.g. the build output dir) are deleted
 * after switching so a stale build from the previous commit is never uploaded.
 */
export const createTryWorktree = async (options: {
  repoRoot: string;
  sha: string;
  name: string;
  cleanPaths?: string[];
}): Promise<TryWorktree> => {
  const { repoRoot, name } = options;
  assertValidName(name);
  const sha = resolveCommit(repoRoot, options.sha);
  const path = worktreePath(repoRoot, name);
  const worktree = await checkOutWorktree({ repoRoot, name, path, sha });
  for (const cleanPath of options.cleanPaths ?? []) {
    rmSync(resolveSafeWritePath(path, assertCleanablePath(cleanPath)), {
      recursive: true,
      force: true,
    });
  }
  return worktree;
};

/** A worktree-relative path that is safe to delete or move out, e.g. a build output dir. */
export const assertCleanablePath = (cleanPath: string): string => {
  const normalized = normalizeRelativeRepoPath(cleanPath);
  if (normalized === "" || normalized.split("/")[0] === ".git") {
    throw new CliUserError(
      `Refusing to clean '${cleanPath}': pass a path inside the worktree, such as its build output directory.`,
    );
  }
  return normalized;
};

const checkOutWorktree = async (options: {
  repoRoot: string;
  name: string;
  path: string;
  sha: string;
}): Promise<TryWorktree> => {
  const { repoRoot, name, path, sha } = options;
  const current = existsSync(path)
    ? tryRunGit(path, ["rev-parse", "HEAD"])
    : null;
  if (current === sha) {
    return {
      name,
      path,
      sha,
      reused: true,
      previousSha: sha,
      installInputsChanged: [],
      seededFrom: null,
    };
  }
  if (current != null && (await switchInPlace(path, sha))) {
    return {
      name,
      path,
      sha,
      reused: true,
      previousSha: current,
      installInputsChanged: listChangedInstallInputs(repoRoot, current, sha),
      seededFrom: null,
    };
  }
  if (existsSync(path)) {
    removeTryWorktree({ repoRoot, name });
  }
  mkdirSafeSync(repoRoot, TRY_PATHS.worktrees);
  // Register without checking out, then populate with an explicit checkout so
  // the parallel-checkout config applies to the expensive file writes.
  await runGitAsync(repoRoot, [
    "worktree",
    "add",
    "--detach",
    "--no-checkout",
    "--force",
    path,
    sha,
  ]);
  await runGitAsync(path, [
    ...PARALLEL_CHECKOUT,
    "checkout",
    "--force",
    "--detach",
    sha,
  ]);
  const seed = await seedWorktreeNodeModules({
    repoRoot,
    worktreePath: path,
    sha,
    donorCandidates: seedDonorCandidates(repoRoot, name),
  });
  return {
    name,
    path,
    sha,
    reused: false,
    previousSha: null,
    // A donor is only ever used when its install fits `sha` as-is, so a
    // complete copy means no install; anything else means a cold install.
    installInputsChanged: seed?.complete === true ? [] : null,
    seededFrom: seed ? { path: seed.donorPath, sha: seed.donorSha } : null,
  };
};

const SLOT_WORKTREE = /^slot-(\d+)$/;

/**
 * Checkouts a new worktree's node_modules may be copied from. A slot worktree
 * whose slot is currently held is excluded: its holder may be mid-install, and
 * a torn copy would pass the clean-lockfile check and poison the build.
 */
const seedDonorCandidates = (
  repoRoot: string,
  excludeName: string,
): string[] => {
  const heldSlots = new Set(
    listHeldSlots(
      absoluteTryPath(repoRoot, join(TRY_PATHS.slots, "held")),
      DEFAULT_LEASE_SECONDS,
    ),
  );
  return [
    ...listTryWorktreeNames(repoRoot)
      .filter((name) => {
        if (name === excludeName) {
          return false;
        }
        const slot = SLOT_WORKTREE.exec(name);
        return slot == null || !heldSlots.has(Number.parseInt(slot[1], 10));
      })
      .map((name) => worktreePath(repoRoot, name)),
    repoRoot,
  ];
};

/**
 * Leaves the worktree matching `sha`, as a new one would: `--force` discards
 * edits a build step or the replay fix made to tracked files, and `clean`
 * removes files they added. Ignored files such as node_modules and build
 * caches stay.
 */
const switchInPlace = async (path: string, sha: string): Promise<boolean> =>
  (await tryRunGitAsync(path, [
    ...PARALLEL_CHECKOUT,
    "checkout",
    "--force",
    "--detach",
    sha,
  ])) != null && (await tryRunGitAsync(path, ["clean", "-fdq"])) != null;

export const removeTryWorktree = (options: {
  repoRoot: string;
  name: string;
}): { name: string; removed: boolean } => {
  assertValidName(options.name);
  const removed = discardWorktrees(options.repoRoot, [options.name]);
  return { name: options.name, removed: removed.length > 0 };
};

export const removeAllTryWorktrees = (repoRoot: string): string[] =>
  discardWorktrees(repoRoot, listTryWorktreeNames(repoRoot));

export const listTryWorktreeNames = (repoRoot: string): string[] => {
  const root = absoluteTryPath(repoRoot, TRY_PATHS.worktrees);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && WORKTREE_NAME.test(entry.name))
    .map((entry) => entry.name);
};

/**
 * Moving a worktree aside and pruning is instant, whereas `git worktree
 * remove` deletes every file before returning; the files are deleted in the
 * background instead.
 */
const discardWorktrees = (repoRoot: string, names: string[]): string[] => {
  const removed: string[] = [];
  for (const name of names) {
    const path = worktreePath(repoRoot, name);
    if (!existsSync(path)) {
      continue;
    }
    if (!moveToTrash(repoRoot, path)) {
      runGit(repoRoot, ["worktree", "remove", "--force", path]);
    }
    removed.push(name);
  }
  runGit(repoRoot, ["worktree", "prune"]);
  if (removed.length > 0) {
    emptyTrashInBackground(repoRoot);
  }
  return removed;
};

/** The path of an existing try worktree, by name. */
export const existingTryWorktreePath = (
  repoRoot: string,
  name: string,
): string => {
  assertValidName(name);
  const path = worktreePath(repoRoot, name);
  if (!existsSync(path)) {
    throw new CliUserError(
      `No try worktree named '${name}'. Create it with \`meticulous try worktree --sha <sha> --name ${name}\`.`,
    );
  }
  return path;
};

export const worktreePath = (repoRoot: string, name: string): string =>
  join(absoluteTryPath(repoRoot, TRY_PATHS.worktrees), name);

const assertValidName = (name: string): void => {
  if (!WORKTREE_NAME.test(name)) {
    throw new CliUserError(
      `Invalid worktree name '${name}': use letters, digits, '.', '_' or '-' (e.g. pr-123-head).`,
    );
  }
};

export const resolveCommit = (repoRoot: string, sha: string): string => {
  if (sha.startsWith("-")) {
    throw new CliUserError(`Invalid commit '${sha}'.`);
  }
  const resolved = tryRunGit(repoRoot, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${sha}^{commit}`,
  ]);
  if (!resolved) {
    throw new CliUserError(`Commit '${sha}' not found in ${repoRoot}.`);
  }
  return resolved;
};
