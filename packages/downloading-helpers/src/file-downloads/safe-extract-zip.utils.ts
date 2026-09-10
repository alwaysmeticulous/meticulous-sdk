import { lstat, mkdir } from "fs/promises";
import { isAbsolute, join, relative, sep } from "path";
import type { Entry, ZipFile } from "yauzl";

export const S_IFMT = 0o170000;
export const S_IFDIR = 0o040000;
export const S_IFLNK = 0o120000;
const DOS_DIRECTORY_ATTRIBUTE = 0x10;

/**
 * Directory prefix Finder writes AppleDouble metadata under. `extract-zip`
 * skipped these before writing, so honouring them here would newly litter
 * served asset roots with `._`-prefixed files.
 */
const MACOS_METADATA_PREFIX = "__MACOSX/";

/**
 * How long to wait for yauzl to report the archive's fd closed before giving
 * up. See {@link closeZipFile}.
 */
const CLOSE_TIMEOUT_MS = 5_000;

export const isMacOsMetadataEntry = (fileName: string): boolean =>
  fileName === MACOS_METADATA_PREFIX.slice(0, -1) ||
  fileName.startsWith(MACOS_METADATA_PREFIX);

export const isDirectoryEntry = (entry: Entry, fileType: number): boolean => {
  if (entry.fileName.endsWith("/") || fileType === S_IFDIR) {
    return true;
  }
  // Archives made on Windows carry DOS attributes instead of a Unix mode.
  const madeByUnix = entry.versionMadeBy >> 8 !== 0;
  return (
    !madeByUnix &&
    (entry.externalFileAttributes & DOS_DIRECTORY_ATTRIBUTE) !== 0
  );
};

/**
 * Closes the archive and waits for the fd to actually be released.
 *
 * yauzl closes asynchronously and reports a failed close as an `'error'` on the
 * ZipFile. Both facts matter: once `eachEntry()` has finished iterating nothing
 * is listening, so an unobserved `'error'` emit would terminate the process,
 * and callers delete the archive as soon as we return, which must not race the
 * close. The error is observed but deliberately not rethrown — this runs from a
 * `finally`, where throwing would mask whatever error got us there.
 *
 * The wait is bounded because `'close'` only fires once yauzl's reader refcount
 * reaches zero. Every read stream we open is either fully piped or explicitly
 * destroyed, both of which drop the ref, but a leaked fd is a better failure
 * mode than an extraction that hangs forever if that ever stops holding.
 */
export const closeZipFile = (zipfile: ZipFile): Promise<void> => {
  if (!zipfile.isOpen) {
    return Promise.resolve();
  }
  return new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, CLOSE_TIMEOUT_MS);
    const settle = (): void => {
      clearTimeout(timeout);
      resolvePromise();
    };
    zipfile.once("error", settle);
    zipfile.once("close", settle);
    zipfile.close();
  });
};

/**
 * Creates every missing component of `target` one at a time, rejecting any
 * component that is already a symlink. `mkdir({ recursive: true })` would
 * instead follow such a symlink and materialise directories outside `root`
 * before any later containment check could reject the entry.
 *
 * `verifiedDirs` memoizes the components already created or checked during this
 * extraction, which takes a deep archive from `mkdir` + `lstat` per component
 * per entry down to one pair per distinct directory. Only paths this call
 * created itself or has already `lstat`'d are recorded, so the guarantee is
 * unchanged.
 */
export const mkdirInside = async (
  root: string,
  target: string,
  fileName: string,
  verifiedDirs: Set<string>,
): Promise<void> => {
  assertInside(root, target, fileName);
  if (verifiedDirs.has(target)) {
    return;
  }

  const relativePath = relative(root, target);
  if (relativePath === "") {
    return;
  }

  let current = root;
  for (const component of relativePath.split(sep)) {
    current = join(current, component);
    if (verifiedDirs.has(current)) {
      continue;
    }

    let created = false;
    try {
      await mkdir(current);
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }

    // A directory we just created cannot be a symlink or a file, so only a
    // pre-existing path needs inspecting.
    if (!created) {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(
          `safeExtractZip: entry "${fileName}" resolves outside the target directory`,
        );
      }
      if (!stats.isDirectory()) {
        throw new Error(
          `safeExtractZip: entry "${fileName}" collides with an existing file`,
        );
      }
    }

    verifiedDirs.add(current);
  }
};

export const assertNotSymlink = async (
  destination: string,
  fileName: string,
): Promise<void> => {
  const stats = await lstat(destination).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    },
  );
  if (stats?.isSymbolicLink()) {
    throw new Error(
      `safeExtractZip: entry "${fileName}" resolves outside the target directory`,
    );
  }
};

/**
 * Throws unless `path` is `root` itself or below it. Exported for unit tests:
 * yauzl rejects `..` segments and absolute entry names before we ever see them,
 * so this layer is only reachable through a pre-existing symlink under `root`
 * and cannot otherwise be exercised end-to-end.
 */
export const assertInside = (
  root: string,
  path: string,
  fileName: string,
): void => {
  const relativePath = relative(root, path);
  if (
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\") ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `safeExtractZip: entry "${fileName}" resolves outside the target directory`,
    );
  }
};
