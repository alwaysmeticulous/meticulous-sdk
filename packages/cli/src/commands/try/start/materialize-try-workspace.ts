import { readdirSync } from "fs";
import { join } from "path";
import { tryTemplatesDir } from "../../../bundled-assets";
import { ensureGitignoreEntry } from "../../onboard/materialize-workspace";
import {
  copyFileSafeSync,
  mkdirSafeSync,
  resolveSafeWritePath,
  writeFileSafeSync,
} from "../../onboard/safe-repo-fs";
import {
  METICULOUS_MCP_URL,
  mergeJsonMcp,
} from "../../onboard/setup-agent-integrations";
import type { PackageManager } from "../shared/try-context";
import { buildAgentEnvScript } from "../shared/agent-env-script";
import {
  TRY_GITIGNORE_COMMENT,
  TRY_PATHS,
  TRY_WORKDIR,
  absoluteTryPath,
} from "../shared/try-paths";
import { buildTrySettings } from "./try-settings";

/**
 * Writes the gitignored `.meticulous-try/` Claude Code workspace: CLAUDE.md,
 * settings, subagents, skills and a project-scoped Meticulous MCP config. The
 * repo itself is reached through `--add-dir`; nothing tracked is modified
 * except the `.gitignore` entry for the workspace.
 */
export const materializeTryWorkspace = (options: {
  repoRoot: string;
  packageManager: PackageManager | null;
  /** Non-secret environment for every Claude Code session in the workspace. */
  agentEnv: Record<string, string>;
}): string => {
  const { repoRoot } = options;
  mkdirSafeSync(repoRoot, TRY_PATHS.claude);
  mkdirSafeSync(repoRoot, TRY_PATHS.agentDataDir);
  writeFileSafeSync(
    repoRoot,
    TRY_PATHS.agentEnvScript,
    buildAgentEnvScript({
      pinnedEnv: options.agentEnv,
      contextPath: absoluteTryPath(repoRoot, TRY_PATHS.context),
    }),
  );
  writeFileSafeSync(repoRoot, join(TRY_WORKDIR, ".gitignore"), "*\n");

  copyTemplateTree(repoRoot, tryTemplatesDir, TRY_PATHS.claude);
  writeFileSafeSync(
    repoRoot,
    join(TRY_PATHS.claude, "settings.json"),
    JSON.stringify(
      buildTrySettings(options.packageManager, options.agentEnv),
      null,
      2,
    ) + "\n",
  );
  mergeJsonMcp(repoRoot, join(TRY_WORKDIR, ".mcp.json"), {
    type: "http",
    url: METICULOUS_MCP_URL,
  });
  mkdirSafeSync(repoRoot, TRY_PATHS.backtests);
  mkdirSafeSync(repoRoot, TRY_PATHS.recordingBugs);
  mkdirSafeSync(repoRoot, TRY_PATHS.worktrees);
  mkdirSafeSync(repoRoot, TRY_PATHS.builds);

  ensureGitignoreEntry(repoRoot, TRY_WORKDIR, TRY_GITIGNORE_COMMENT);
  return resolveSafeWritePath(repoRoot, TRY_WORKDIR);
};

/** Mirrors the vendored templates (CLAUDE.md, agents/, skills/) into the workspace. */
const copyTemplateTree = (
  repoRoot: string,
  sourceDir: string,
  destRelative: string,
): void => {
  mkdirSafeSync(repoRoot, destRelative);
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = join(sourceDir, entry.name);
    const dest = join(destRelative, entry.name);
    if (entry.isDirectory()) {
      copyTemplateTree(repoRoot, source, dest);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      copyFileSafeSync(repoRoot, dest, source);
    }
  }
};
