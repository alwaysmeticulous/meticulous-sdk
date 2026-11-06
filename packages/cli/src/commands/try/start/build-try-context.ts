import type { SelfOnboardResponse } from "@alwaysmeticulous/client";
import { METICULOUS_APP_URL } from "../../onboard/build-context";
import { detectFramework } from "../../onboard/detect-framework";
import { resolveSelectedAppAbsolutePath } from "../../onboard/discover-apps";
import type { PackageManager, TryContextJson } from "../shared/try-context";
import { TRY_PATHS, absoluteTryPath } from "../shared/try-paths";
import type { TryAppSelection } from "./resolve-try-app";

export const buildTryContext = (options: {
  repoRoot: string;
  workspaceDir: string;
  repoName: string;
  onboarded: SelfOnboardResponse;
  apps: TryAppSelection;
  packageManager: PackageManager | null;
  prCount: number;
  buildSlots: number;
}): TryContextJson => {
  const { repoRoot, onboarded, apps } = options;
  const selectedAppAbsolutePath = apps.selectedApp
    ? resolveSelectedAppAbsolutePath(repoRoot, apps.selectedApp.path)
    : null;
  return {
    version: 1,
    projectRoot: repoRoot,
    workspaceDir: options.workspaceDir,
    repoName: options.repoName,
    organization: onboarded.organization,
    project: onboarded.project,
    apiToken: onboarded.apiToken,
    recordingToken: onboarded.recordingToken,
    projectUrl: `${METICULOUS_APP_URL}/projects/${encodeURIComponent(onboarded.organization.name)}/${encodeURIComponent(onboarded.project.name)}`,
    packageManager: options.packageManager,
    isMonorepo: apps.isMonorepo,
    selectedApp: apps.selectedApp,
    discoveredApps: apps.discoveredApps,
    frameworkDetection: selectedAppAbsolutePath
      ? detectFramework(selectedAppAbsolutePath)
      : null,
    prCount: options.prCount,
    buildSlots: options.buildSlots,
    paths: {
      recipe: absoluteTryPath(repoRoot, TRY_PATHS.recipe),
      candidates: absoluteTryPath(repoRoot, TRY_PATHS.candidates),
      sessions: absoluteTryPath(repoRoot, TRY_PATHS.sessions),
      builds: absoluteTryPath(repoRoot, TRY_PATHS.builds),
      worktrees: absoluteTryPath(repoRoot, TRY_PATHS.worktrees),
      backtests: absoluteTryPath(repoRoot, TRY_PATHS.backtests),
      recordingBugs: absoluteTryPath(repoRoot, TRY_PATHS.recordingBugs),
      replayFix: absoluteTryPath(repoRoot, TRY_PATHS.replayFix),
      authState: absoluteTryPath(repoRoot, TRY_PATHS.authState),
    },
  };
};
