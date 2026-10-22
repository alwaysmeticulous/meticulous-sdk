import { readdirSync } from "fs";
import { join } from "path";

/** Bounds the search on a pathological tree. */
const MAX_DIRECTORIES_READ = 200;

/**
 * Cursor names a project's directory by its path with every run of
 * non-alphanumeric characters replaced by one `-` (e.g. `/Users/a/my.app`
 * becomes `Users-a-my-app`), which can't be reversed on its own. This finds
 * the existing directory whose path encodes to `name`, or null.
 */
export const decodeProjectDirName = (name: string | null): string | null => {
  if (!name) {
    return null;
  }
  const budget = { remaining: MAX_DIRECTORIES_READ };
  const drive = /^([A-Za-z])-(.+)$/.exec(name);
  if (process.platform === "win32" && drive) {
    return findPath(`${drive[1]}:\\`, drive[2] ?? "", budget);
  }
  return findPath("/", name, budget);
};

const findPath = (
  dir: string,
  remaining: string,
  budget: { remaining: number },
): string | null => {
  if (remaining.length === 0) {
    return dir;
  }
  if (budget.remaining-- <= 0) {
    return null;
  }
  for (const entry of listDirectories(dir)) {
    const encoded = encodeSegment(entry);
    if (encoded.length === 0) {
      continue;
    }
    const rest =
      remaining === encoded
        ? ""
        : remaining.startsWith(`${encoded}-`)
          ? remaining.slice(encoded.length + 1)
          : null;
    const found =
      rest === null ? null : findPath(join(dir, entry), rest, budget);
    if (found) {
      return found;
    }
  }
  return null;
};

const encodeSegment = (segment: string): string =>
  segment.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const listDirectories = (dir: string): string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};
