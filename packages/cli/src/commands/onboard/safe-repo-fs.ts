import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "path";
import { CliUserError } from "../../utils/cli-user-error";

/**
 * Resolves `projectRoot` to its real path. Call once at the start of onboard
 * writes so subsequent checks share the same root.
 */
export const resolveRealProjectRoot = (projectRoot: string): string => {
  const absolute = resolve(projectRoot);
  if (!existsSync(absolute)) {
    throw new CliUserError(`Project root does not exist: ${absolute}`);
  }
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    // Allow the root itself to be reached via a symlink (e.g. worktrees), but
    // still pin writes to the real directory.
  }
  return realpathSync(absolute);
};

/**
 * Resolves a repo-relative path for writing under `projectRoot`.
 *
 * Rejects absolute paths, `..` escapes, and any existing symlink on the path
 * from the project root to the target (inclusive). That stops a
 * repository-seeded symlink such as `.meticulous-onboard` → `~/.ssh` from
 * redirecting onboard writes outside the repo.
 */
export const resolveSafeWritePath = (
  projectRoot: string,
  relativePath: string,
): string => {
  const realRoot = resolveRealProjectRoot(projectRoot);
  const normalizedRelative = normalizeRelativeRepoPath(relativePath);
  const parts = normalizedRelative
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");

  let current = realRoot;
  for (let index = 0; index < parts.length; index++) {
    const next = join(current, parts[index]);
    const stat = tryLstat(next);
    if (!stat) {
      current = join(current, ...parts.slice(index));
      break;
    }

    // Use lstat (not existsSync) so broken symlinks are still rejected.
    if (stat.isSymbolicLink()) {
      const display = parts.slice(0, index + 1).join("/");
      throw new CliUserError(
        `Refusing to write through symlink at '${display}'. ` +
          `Remove or replace it, then re-run \`meticulous onboard\`.`,
      );
    }

    if (stat.isDirectory()) {
      current = realpathSync(next);
      if (!isPathInsideRoot(realRoot, current)) {
        throw new CliUserError(
          `Refusing to write outside the project root via '${parts.slice(0, index + 1).join("/")}'.`,
        );
      }
      continue;
    }

    // Existing non-directory leaf (regular file, etc.): must be the final part.
    if (index !== parts.length - 1) {
      throw new CliUserError(
        `Refusing to write under non-directory path '${parts.slice(0, index + 1).join("/")}'.`,
      );
    }
    current = next;
  }

  if (!isPathInsideRoot(realRoot, current)) {
    throw new CliUserError(
      `Refusing to write outside the project root: ${relativePath}`,
    );
  }

  return current;
};

export const mkdirSafeSync = (
  projectRoot: string,
  relativePath: string,
): string => {
  const absolute = resolveSafeWritePath(projectRoot, relativePath);
  mkdirSync(absolute, { recursive: true });
  // Re-check after create: a race could theoretically replace a component, but
  // more importantly ensure we didn't land on a symlink somehow.
  assertNoSymlinkAt(projectRoot, relativePath);
  return absolute;
};

export const writeFileSafeSync = (
  projectRoot: string,
  relativePath: string,
  data: string | NodeJS.ArrayBufferView,
): string => {
  resolveSafeWritePath(projectRoot, relativePath);
  const parentRelative = dirname(normalizeRelativeRepoPath(relativePath));
  if (parentRelative !== "." && parentRelative !== "") {
    mkdirSafeSync(projectRoot, parentRelative);
  }
  // Re-resolve after parents exist so a symlink planted on a parent is caught.
  const target = resolveSafeWritePath(projectRoot, relativePath);
  writeFileSync(target, data);
  return target;
};

export const copyFileSafeSync = (
  projectRoot: string,
  relativePath: string,
  sourceAbsolutePath: string,
): string => {
  const parentRelative = dirname(normalizeRelativeRepoPath(relativePath));
  if (parentRelative !== "." && parentRelative !== "") {
    mkdirSafeSync(projectRoot, parentRelative);
  }
  const target = resolveSafeWritePath(projectRoot, relativePath);
  copyFileSync(sourceAbsolutePath, target);
  return target;
};

/**
 * Asserts that `workspaceDir` is the onboard workspace under `projectRoot`
 * (or a realpath-equivalent path inside it), not an escaped location.
 */
export const assertWorkspaceInsideProject = (
  projectRoot: string,
  workspaceDir: string,
): string => {
  const realRoot = resolveRealProjectRoot(projectRoot);
  if (!existsSync(workspaceDir)) {
    throw new CliUserError(`Onboard workspace does not exist: ${workspaceDir}`);
  }
  if (lstatSync(workspaceDir).isSymbolicLink()) {
    throw new CliUserError(
      `Refusing to use symlink onboard workspace at '${workspaceDir}'.`,
    );
  }
  const realWorkspace = realpathSync(workspaceDir);
  if (!isPathInsideRoot(realRoot, realWorkspace)) {
    throw new CliUserError(
      `Onboard workspace escapes the project root: ${workspaceDir}`,
    );
  }
  return realWorkspace;
};

const assertNoSymlinkAt = (projectRoot: string, relativePath: string): void => {
  resolveSafeWritePath(projectRoot, relativePath);
};

export const normalizeRelativeRepoPath = (relativePath: string): string => {
  if (relativePath.length === 0 || relativePath === ".") {
    throw new CliUserError("Refusing empty write path under the project root.");
  }
  if (isAbsolute(relativePath)) {
    throw new CliUserError(`Refusing absolute write path: ${relativePath}`);
  }
  const normalized = normalize(relativePath).replace(/\\/g, "/");
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new CliUserError(`Refusing path escape: ${relativePath}`);
  }
  return normalized.replace(/^\.\//u, "");
};

export const isPathInsideRoot = (root: string, candidate: string): boolean => {
  const relativeToRoot = relative(root, candidate);
  return (
    relativeToRoot === "" ||
    (!relativeToRoot.startsWith(`..${sep}`) &&
      relativeToRoot !== ".." &&
      !isAbsolute(relativeToRoot))
  );
};

const tryLstat = (path: string) => {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
};

/**
 * True when `absolutePath` is a real (non-symlink) directory whose realpath
 * stays inside the project root. Used by app discovery so a repo-seeded
 * symlink cannot be selected as an onboard target.
 */
export const isRealDirectoryInsideProject = (
  projectRoot: string,
  absolutePath: string,
): boolean => {
  const realRoot = resolveRealProjectRoot(projectRoot);
  const stat = tryLstat(absolutePath);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    return false;
  }
  let realCandidate: string;
  try {
    realCandidate = realpathSync(absolutePath);
  } catch {
    return false;
  }
  return isPathInsideRoot(realRoot, realCandidate);
};

/**
 * Paths the skills installer may create or write under. We must reject
 * repo-seeded symlinks here *before* handing control to the external
 * installer — validating only `.claude` is not enough.
 */
export const SKILLS_INSTALL_DIR_ROOTS = [
  ".claude",
  ".agents",
  ".cursor",
] as const;

export const SKILLS_INSTALL_FILE_TARGETS = ["skills-lock.json"] as const;

export interface SkillsInstallTargets {
  /**
   * Symlinks at or under a dest this install will write, which we cannot
   * replace ourselves. Non-empty means the installer must not run.
   */
  blockingLinks: string[];
}

/**
 * Rejects parent-path symlinks the installer would write through, then
 * creates the destination directory roots as real directories inside the repo.
 *
 * `skillNames` is the exact set of skills this install will write, so the
 * guard only looks at those dests. A link for any other skill belongs to
 * another tool, is never written through, and is ignored.
 *
 * A dest we are about to write, such as `.claude/skills/meticulous-cli`, is
 * often a leftover *link* into a cache from `skills add` without `--copy`.
 * Unlink those (the link only, never the target) so `--copy` can write a real
 * directory. A symlink nested inside such a dest is reported instead: the
 * installer would write through it and it is not ours to delete.
 */
export const prepareSafeSkillsInstallTargets = (
  projectRoot: string,
  skillNames: readonly string[],
): SkillsInstallTargets => {
  for (const file of SKILLS_INSTALL_FILE_TARGETS) {
    // Throws if the path (or any parent component) is a symlink.
    resolveSafeWritePath(projectRoot, file);
  }

  for (const dir of SKILLS_INSTALL_DIR_ROOTS) {
    mkdirSafeSync(projectRoot, dir);
    mkdirSafeSync(projectRoot, join(dir, "skills"));
  }

  const replaceable: string[] = [];
  const blockingLinks: string[] = [];
  for (const dest of skillDestPaths(projectRoot, skillNames)) {
    const stat = tryLstat(dest.absolutePath);
    if (!stat) {
      continue;
    }
    if (stat.isSymbolicLink()) {
      replaceable.push(dest.relativeDisplay);
      continue;
    }
    if (stat.isDirectory()) {
      collectSymlinksUnderDirectory(
        dest.absolutePath,
        dest.relativeDisplay,
        blockingLinks,
      );
    }
  }

  if (blockingLinks.length > 0) {
    // The installer will not run, so leave the leftover links as they are.
    return { blockingLinks };
  }

  const realRoot = resolveRealProjectRoot(projectRoot);
  for (const relative of replaceable) {
    unlinkSync(join(realRoot, relative));
  }
  if (replaceable.length > 0) {
    console.log(
      `  Replaced leftover Meticulous skill link(s) so they can be copied into the repo: ${replaceable.join(
        ", ",
      )}`,
    );
  }
  return { blockingLinks: [] };
};

/**
 * Re-checks the dests this install wrote, so a TOCTOU symlink plant during the
 * install cannot go unnoticed — including nested ones. Dests for other tools'
 * skills are not ours to police.
 */
export const assertSafeSkillsInstallTargets = (
  projectRoot: string,
  skillNames: readonly string[],
): void => {
  for (const file of SKILLS_INSTALL_FILE_TARGETS) {
    resolveSafeWritePath(projectRoot, file);
  }
  for (const dir of SKILLS_INSTALL_DIR_ROOTS) {
    resolveSafeWritePath(projectRoot, dir);
    resolveSafeWritePath(projectRoot, join(dir, "skills"));
  }

  const found: string[] = [];
  for (const dest of skillDestPaths(projectRoot, skillNames)) {
    collectSymlinksAtPath(dest.absolutePath, dest.relativeDisplay, found);
  }
  const [first] = found;
  if (first !== undefined) {
    throw new CliUserError(
      `Refusing to write through symlink at '${first}'. ` +
        `Remove or replace it, then re-run \`meticulous onboard\`.`,
    );
  }
};

/** Where each named skill lands, under every agent's skills directory. */
const skillDestPaths = (
  projectRoot: string,
  skillNames: readonly string[],
): Array<{ absolutePath: string; relativeDisplay: string }> => {
  const realRoot = resolveRealProjectRoot(projectRoot);
  const dests: Array<{ absolutePath: string; relativeDisplay: string }> = [];
  for (const dir of SKILLS_INSTALL_DIR_ROOTS) {
    for (const name of skillNames) {
      dests.push({
        absolutePath: join(realRoot, dir, "skills", name),
        relativeDisplay: `${dir}/skills/${name}`,
      });
    }
  }
  return dests;
};

const collectSymlinksAtPath = (
  absolutePath: string,
  relativeDisplay: string,
  found: string[],
): void => {
  const stat = tryLstat(absolutePath);
  if (!stat) {
    return;
  }
  if (stat.isSymbolicLink()) {
    found.push(relativeDisplay);
    return;
  }
  if (stat.isDirectory()) {
    collectSymlinksUnderDirectory(absolutePath, relativeDisplay, found);
  }
};

const collectSymlinksUnderDirectory = (
  absoluteDir: string,
  relativeDisplay: string,
  found: string[],
): void => {
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const childRelative = `${relativeDisplay}/${entry.name}`;
    // Check symlink before isDirectory(): a symlink-to-dir can report as both
    // depending on platform / Node version.
    if (entry.isSymbolicLink()) {
      found.push(childRelative);
      continue;
    }
    if (entry.isDirectory()) {
      collectSymlinksUnderDirectory(
        join(absoluteDir, entry.name),
        childRelative,
        found,
      );
    }
  }
};
