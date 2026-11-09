import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { detectRepoUrl } from "../../onboard/git-repo-info";
import type { PackageManager } from "../shared/try-context";

export const MAX_PROJECT_NAME_LENGTH = 100;

/** The repository's name (from the origin remote, else the directory name). */
export const deriveProjectName = (
  repoRoot: string,
  repoUrl: string | null = detectRepoUrl(repoRoot),
): string => {
  const fromRemote = repoUrl
    ?.replace(/\/+$/, "")
    .split(/[/:]/)
    .pop()
    ?.replace(/\.git$/, "");
  const raw = fromRemote || basename(repoRoot);
  const sanitized = raw
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_PROJECT_NAME_LENGTH);
  return sanitized || "app";
};

const LOCKFILES: Array<[string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/**
 * The package manager the repo uses: package.json's `packageManager` field,
 * else the first lockfile found at the repo root or in the app directory.
 */
export const detectPackageManager = (dirs: string[]): PackageManager | null => {
  for (const dir of dirs) {
    const declared = readDeclaredPackageManager(dir);
    if (declared) {
      return declared;
    }
    const lockfile = LOCKFILES.find(([file]) => existsSync(join(dir, file)));
    if (lockfile) {
      return lockfile[1];
    }
  }
  return null;
};

const readDeclaredPackageManager = (dir: string): PackageManager | null => {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      packageManager?: unknown;
    };
    if (typeof pkg.packageManager !== "string") {
      return null;
    }
    const name = pkg.packageManager.split("@")[0];
    return (
      LOCKFILES.map(([, manager]) => manager).find(
        (manager) => manager === name,
      ) ?? null
    );
  } catch {
    return null;
  }
};
