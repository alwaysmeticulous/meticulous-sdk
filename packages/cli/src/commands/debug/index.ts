import { mkdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { cleanWorkspaces } from "./clean-workspaces";
import { createProjectWorktree } from "./project-worktree";
import { getDebugSessionsDir } from "./debug-constants";
import { downloadDebugData } from "./download-debug-data";
import { generateDebugWorkspace } from "./generate-debug-workspace";
import { presentWorkspace } from "./present-workspace";
import { resolveDebugContext } from "./resolve-debug-context";

const SHARED_OPTIONS = {
  apiToken: OPTIONS.apiToken,
  workspaceName: {
    string: true as const,
    description:
      "Custom name for the debug workspace (defaults to a timestamp)",
  },
  screenshot: {
    string: true as const,
    description: "Screenshot filename to focus analysis on",
  },
};

const createWorkspaceDir = (workspaceName: string | undefined): string => {
  const debugSessionsDir = getDebugSessionsDir();
  const name =
    workspaceName || `debug-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const workspaceDir = join(debugSessionsDir, name);
  mkdirSync(workspaceDir, { recursive: true });
  return workspaceDir;
};

const runDebugPipeline = async (opts: {
  apiToken: string | undefined;
  workspaceName: string | undefined;
  screenshot: string | undefined;
  replayDiffId?: string | undefined;
  testRunId?: string | undefined;
  replayIds?: string[] | undefined;
  sessionId?: string | undefined;
  maxDiffs?: number | undefined;
}): Promise<void> => {
  const debugContext = await resolveDebugContext({
    apiToken: opts.apiToken,
    replayDiffId: opts.replayDiffId,
    testRunId: opts.testRunId,
    replayIds: opts.replayIds ?? [],
    sessionId: opts.sessionId,
    maxDiffs: opts.maxDiffs ?? 5,
    screenshot: opts.screenshot,
  });

  console.log(
    chalk.bold(`\nProject: ${chalk.cyan(debugContext.orgAndProject)}`),
  );

  const workspaceDir = createWorkspaceDir(opts.workspaceName);
  console.log(`\nWorkspace: ${chalk.cyan(workspaceDir)}\n`);

  console.log(chalk.bold("Downloading data..."));
  await downloadDebugData({
    apiToken: opts.apiToken,
    debugContext,
    workspaceDir,
  });

  console.log(chalk.bold("\nSetting up workspace..."));
  const projectRepoDir = createProjectWorktree({
    debugContext,
    workspaceDir,
  });

  generateDebugWorkspace({
    debugContext,
    workspaceDir,
    projectRepoDir,
  });

  presentWorkspace({ workspaceDir, projectRepoDir });
};

 
const replayDiffCommand: CommandModule<any, any> = {
  command: "replay-diff <replayDiffId>",
  describe: "Debug a specific replay diff",
  builder: (yargs) =>
    yargs
      .positional("replayDiffId", {
        type: "string",
        demandOption: true,
        description: "The replay diff ID to debug",
      })
      .option("sessionId", {
        string: true,
        description: "Override the session ID for this replay diff",
      })
      .option(SHARED_OPTIONS),
  handler: wrapHandler(async (args) => {
    await runDebugPipeline({
      apiToken: args.apiToken,
      workspaceName: args.workspaceName,
      screenshot: args.screenshot,
      replayDiffId: args.replayDiffId,
      sessionId: args.sessionId,
    });
  }),
};

 
const testRunCommand: CommandModule<any, any> = {
  command: "test-run <testRunId>",
  describe: "Debug all diffs in a test run",
  builder: (yargs) =>
    yargs
      .positional("testRunId", {
        type: "string",
        demandOption: true,
        description: "The test run ID to debug",
      })
      .option("maxDiffs", {
        number: true,
        description: "Maximum number of replay diffs to download",
        default: 5,
      })
      .option(SHARED_OPTIONS),
  handler: wrapHandler(async (args) => {
    await runDebugPipeline({
      apiToken: args.apiToken,
      workspaceName: args.workspaceName,
      screenshot: args.screenshot,
      testRunId: args.testRunId,
      maxDiffs: args.maxDiffs,
    });
  }),
};

 
const replaysCommand: CommandModule<any, any> = {
  command: "replays <replayIds..>",
  describe: "Debug one or more replays by ID",
  builder: (yargs) =>
    yargs
      .positional("replayIds", {
        type: "string",
        array: true,
        demandOption: true,
        description: "One or more replay IDs to debug",
      })
      .option("sessionId", {
        string: true,
        description: "Override the session ID",
      })
      .option(SHARED_OPTIONS),
  handler: wrapHandler(async (args) => {
    await runDebugPipeline({
      apiToken: args.apiToken,
      workspaceName: args.workspaceName,
      screenshot: args.screenshot,
      replayIds: args.replayIds,
      sessionId: args.sessionId,
    });
  }),
};

 
const cleanCommand: CommandModule<any, any> = {
  command: "clean",
  describe: "Clean up debug workspaces",
  handler: wrapHandler(async () => {
    await cleanWorkspaces();
  }),
};

export const debugCommand: CommandModule = {
  command: "debug <command>",
  describe:
    "Set up a debug workspace for investigating Meticulous diffs and replays",
  builder: (yargs) =>
    yargs
      .command(replayDiffCommand)
      .command(testRunCommand)
      .command(replaysCommand)
      .command(cleanCommand)
      .demandCommand(1, "Please specify a debug subcommand"),
  handler: () => {
    // Handled by subcommands
  },
};
