import { mkdirSync } from "fs";
import { join } from "path";
import { MeticulousClient } from "@alwaysmeticulous/client";
import chalk from "chalk";
import type { DomDiffMap } from "./compute-dom-diffs";
import { getDebugSessionsDir } from "./debug-constants";
import { DebugContext } from "./debug.types";
import { downloadDebugData } from "./download-debug-data";
import {
  generateDebugWorkspace,
  FileMetadataEntry,
  ScreenshotMapEntry,
  ReplayComparisonEntry,
} from "./generate-debug-workspace";
import { resolveDebugContext } from "./resolve-debug-context";

export interface DebugPipelineOptions {
  client: MeticulousClient;
  workspaceName?: string | undefined;
  screenshot?: string | undefined;
  maxConcurrentDownloads?: number | undefined;

  replayDiffId?: string | undefined;
  replayIds?: string[] | undefined;
  sessionId?: string | undefined;

  onContextResolved?: ((ctx: DebugContext) => void | Promise<void>) | undefined;
  createWorktree?:
    | ((ctx: DebugContext, workspaceDir: string) => string | undefined)
    | undefined;
  additionalDownloads?:
    | ((ctx: DebugContext, debugDataDir: string) => void | Promise<void>)
    | undefined;
  additionalTemplatesDir?: string | undefined;
  writeContextJson?:
    | ((
        debugContext: DebugContext,
        workspaceDir: string,
        fileMetadata: FileMetadataEntry[],
        projectRepoDir: string | undefined,
        screenshotMap: Record<string, ScreenshotMapEntry>,
        replayComparison: ReplayComparisonEntry[],
        domDiffMap: DomDiffMap,
      ) => void)
    | undefined;
  onWorkspaceReady?:
    | ((workspaceDir: string, projectRepoDir: string | undefined) => void)
    | undefined;
}

export const runDebugPipeline = async (
  opts: DebugPipelineOptions,
): Promise<void> => {
  const debugContext = await resolveDebugContext({
    client: opts.client,
    replayDiffId: opts.replayDiffId,
    replayIds: opts.replayIds ?? [],
    sessionId: opts.sessionId,
    screenshot: opts.screenshot,
  });

  if (opts.onContextResolved) {
    await opts.onContextResolved(debugContext);
  }

  console.log(
    chalk.bold(`\nProject: ${chalk.cyan(debugContext.orgAndProject)}`),
  );

  const workspaceDir = createWorkspaceDir(opts.workspaceName);
  console.log(`\nWorkspace: ${chalk.cyan(workspaceDir)}\n`);

  console.log(chalk.bold("Downloading data..."));
  await downloadDebugData({
    client: opts.client,
    debugContext,
    workspaceDir,
    maxConcurrentDownloads: opts.maxConcurrentDownloads,
    additionalDownloads: opts.additionalDownloads,
  });

  console.log(chalk.bold("\nSetting up workspace..."));
  let projectRepoDir: string | undefined;
  if (opts.createWorktree) {
    projectRepoDir = opts.createWorktree(debugContext, workspaceDir);
  }

  generateDebugWorkspace({
    debugContext,
    workspaceDir,
    projectRepoDir,
    additionalTemplatesDir: opts.additionalTemplatesDir,
    writeContextJson: opts.writeContextJson,
  });

  if (opts.onWorkspaceReady) {
    opts.onWorkspaceReady(workspaceDir, projectRepoDir);
  }
};

const createWorkspaceDir = (workspaceName: string | undefined): string => {
  const debugSessionsDir = getDebugSessionsDir();
  const name =
    workspaceName || `debug-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const workspaceDir = join(debugSessionsDir, name);
  mkdirSync(workspaceDir, { recursive: true });
  return workspaceDir;
};
