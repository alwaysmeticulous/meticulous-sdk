import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { readTextOrNull } from "./find-git-dirs";
import type { GitConfigEntry } from "./parse-git-config";
import { parseGitConfig } from "./parse-git-config";

const MAX_INCLUDE_DEPTH = 10;

/**
 * Reads a git config file, following `[include] path` and
 * `[includeIf "gitdir:…"] path` (work emails commonly live in an
 * includeIf'd file). Other includeIf conditions are ignored.
 */
export const readGitConfig = (
  path: string,
  gitDirs: string[],
  depth = 0,
): GitConfigEntry[] => {
  const text = readTextOrNull(path);
  if (text === null || depth > MAX_INCLUDE_DEPTH) {
    return [];
  }
  return parseGitConfig(text).flatMap((entry) => {
    const includePath = getIncludePath(entry, gitDirs, dirname(path));
    return includePath
      ? readGitConfig(includePath, gitDirs, depth + 1)
      : [entry];
  });
};

const matchesGitDirCondition = (
  condition: string,
  gitDirs: string[],
  configDir: string,
): boolean => {
  const match = /^gitdir(\/i)?:(.+)$/.exec(condition);
  if (!match?.[2]) {
    return false;
  }
  const regex = gitDirPatternToRegex(match[2], configDir, !!match[1]);
  return gitDirs.some((gitDir) => regex.test(`${gitDir}/`));
};

const getIncludePath = (
  entry: GitConfigEntry,
  gitDirs: string[],
  configDir: string,
): string | null => {
  if (entry.key !== "path") {
    return null;
  }
  const isInclude = entry.section === "include" && entry.subsection === null;
  const isMatchingIncludeIf =
    entry.section === "includeif" &&
    entry.subsection !== null &&
    matchesGitDirCondition(entry.subsection, gitDirs, configDir);
  if (!isInclude && !isMatchingIncludeIf) {
    return null;
  }
  const expanded = expandHome(entry.value);
  return isAbsolute(expanded) ? expanded : resolve(configDir, expanded);
};

/** Mirrors git's rules for `gitdir:` patterns (see `git help config`). */
const gitDirPatternToRegex = (
  rawPattern: string,
  configDir: string,
  caseInsensitive: boolean,
): RegExp => {
  let pattern = expandHome(rawPattern);
  if (pattern.startsWith("./")) {
    pattern = join(configDir, pattern.slice(2));
  } else if (!isAbsolute(pattern)) {
    pattern = `**/${pattern}`;
  }
  if (pattern.endsWith("/")) {
    pattern += "**";
  }
  const source = pattern
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      switch (part) {
        case "**/":
          return "(?:.*/)?";
        case "**":
          return ".*";
        case "*":
          return "[^/]*";
        case "?":
          return "[^/]";
        default:
          return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      }
    })
    .join("");
  return new RegExp(`^${source}/?$`, caseInsensitive ? "i" : "");
};

const expandHome = (path: string): string =>
  path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
