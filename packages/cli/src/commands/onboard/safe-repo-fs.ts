import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
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

/**
 * Rejects symlinks on every path the skills installer may write through, then
 * creates the destination directory roots as real directories inside the repo.
 * Also walks any pre-existing nested entries under each agent's skills tree —
 * a real `skills` dir with a last-component symlink like
 * `.claude/skills/<name> -> ~/.ssh` would otherwise let the installer write
 * outside the project while the shallow check still passes.
 */
export const prepareSafeSkillsInstallTargets = (projectRoot: string): void => {
  for (const file of SKILLS_INSTALL_FILE_TARGETS) {
    // Throws if the path (or any parent component) is a symlink.
    resolveSafeWritePath(projectRoot, file);
  }

  for (const dir of SKILLS_INSTALL_DIR_ROOTS) {
    mkdirSafeSync(projectRoot, dir);
    mkdirSafeSync(projectRoot, join(dir, "skills"));
  }

  assertNoSymlinksUnderSkillsTrees(projectRoot);
};

/**
 * Re-checks skills install destinations after an external installer runs, so a
 * TOCTOU symlink plant during the install cannot go unnoticed — including
 * nested last-component symlinks under each agent's skills tree.
 */
export const assertSafeSkillsInstallTargets = (projectRoot: string): void => {
  for (const file of SKILLS_INSTALL_FILE_TARGETS) {
    resolveSafeWritePath(projectRoot, file);
  }
  for (const dir of SKILLS_INSTALL_DIR_ROOTS) {
    resolveSafeWritePath(projectRoot, dir);
    resolveSafeWritePath(projectRoot, join(dir, "skills"));
  }
  assertNoSymlinksUnderSkillsTrees(projectRoot);
};

/**
 * Recursively rejects any symlink under `.claude/skills`, `.agents/skills`,
 * and `.cursor/skills`. Matches `resolveSafeWritePath`: any symlink is refused,
 * not only ones that currently resolve outside the repo.
 */
export const assertNoSymlinksUnderSkillsTrees = (projectRoot: string): void => {
  const realRoot = resolveRealProjectRoot(projectRoot);
  for (const dir of SKILLS_INSTALL_DIR_ROOTS) {
    const relativeSkills = join(dir, "skills").replace(/\\/g, "/");
    const absoluteSkills = join(realRoot, dir, "skills");
    assertNoSymlinksUnderDirectory(absoluteSkills, relativeSkills);
  }
};

const assertNoSymlinksUnderDirectory = (
  absoluteDir: string,
  relativeDisplay: string,
): void => {
  const dirStat = tryLstat(absoluteDir);
  if (!dirStat) {
    return;
  }
  if (dirStat.isSymbolicLink()) {
    throw new CliUserError(
      `Refusing to write through symlink at '${relativeDisplay}'. ` +
        `Remove or replace it, then re-run \`meticulous onboard\`.`,
    );
  }
  if (!dirStat.isDirectory()) {
    return;
  }

  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const childRelative = `${relativeDisplay}/${entry.name}`;
    // Check symlink before isDirectory(): a symlink-to-dir can report as both
    // depending on platform / Node version.
    if (entry.isSymbolicLink()) {
      throw new CliUserError(
        `Refusing to write through symlink at '${childRelative}'. ` +
          `Remove or replace it, then re-run \`meticulous onboard\`.`,
      );
    }
    if (entry.isDirectory()) {
      assertNoSymlinksUnderDirectory(
        join(absoluteDir, entry.name),
        childRelative,
      );
    }
  }
};
