import { chmodSync, existsSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { CliUserError } from "../../../utils/cli-user-error";
import type { FrameworkDetection } from "../../onboard/detect-framework";
import type { DiscoveredApp } from "../../onboard/discover-apps";
import {
  mkdirSafeSync,
  normalizeRelativeRepoPath,
  resolveSafeWritePath,
} from "../../onboard/safe-repo-fs";
import { TRY_PATHS, absoluteTryPath } from "./try-paths";
import { CLI_COMMAND } from "./cli-command";

export type PackageManager = "pnpm" | "yarn" | "npm" | "bun";

export interface TryContextJson {
  version: 1;
  projectRoot: string;
  workspaceDir: string;
  repoName: string;
  organization: { id: string; name: string };
  project: { id: string; name: string };
  /** Secret. Also exported to the agent as METICULOUS_API_TOKEN. */
  apiToken: string;
  recordingToken: string;
  projectUrl: string;
  packageManager: PackageManager | null;
  isMonorepo: boolean;
  /** Null when the CLI left the monorepo app choice to the agent. */
  selectedApp: DiscoveredApp | null;
  discoveredApps: DiscoveredApp[];
  frameworkDetection: FrameworkDetection | null;
  prCount: number;
  /** How many installs and builds may run at once (`meticulous try slot`). */
  buildSlots: number;
  paths: {
    recipe: string;
    candidates: string;
    sessions: string;
    builds: string;
    worktrees: string;
    backtests: string;
    /** One markdown file per app bug noticed while recording. */
    recordingBugs: string;
    /** Written by `meticulous try replay-fix save`; absent until a fix is needed. */
    replayFix: string;
    /** Written by `meticulous try login`; absent until the user has logged in. */
    authState: string;
  };
}

/** try-context.json holds the project API token, so only its owner may read it. */
export const writeTryContext = (
  repoRoot: string,
  context: TryContextJson,
): string => writePrivateWorkspaceJson(repoRoot, TRY_PATHS.context, context);

/**
 * Writes a JSON file readable by the owner only. The mode is tightened before
 * writing so a secret is never briefly world-readable on a re-run over an older,
 * looser file.
 */
export const writePrivateWorkspaceJson = (
  repoRoot: string,
  relativePath: string,
  value: unknown,
): string => {
  mkdirSafeSync(repoRoot, dirname(normalizeRelativeRepoPath(relativePath)));
  const target = resolveSafeWritePath(repoRoot, relativePath);
  if (existsSync(target)) {
    chmodSync(target, 0o600);
  }
  writeFileSync(target, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  chmodSync(target, 0o600);
  return target;
};

export const readTryContext = (repoRoot: string): TryContextJson | null => {
  const path = absoluteTryPath(repoRoot, TRY_PATHS.context);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TryContextJson;
  } catch {
    throw new CliUserError(
      `${path} is not valid JSON. Delete it and re-run \`${CLI_COMMAND} try\`.`,
    );
  }
};
