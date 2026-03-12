import { createClientWithOAuth } from "@alwaysmeticulous/client";
import { runDebugPipeline } from "@alwaysmeticulous/debug-workspace";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { cleanWorkspaces } from "./clean-workspaces";
import { presentWorkspace } from "./present-workspace";
import {
  createProjectWorktree,
  removeProjectWorktree,
} from "./project-worktree";

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

const runPipeline = async (opts: {
  apiToken: string | undefined;
  workspaceName: string | undefined;
  screenshot: string | undefined;
  replayDiffId?: string | undefined;
  testRunId?: string | undefined;
  replayIds?: string[] | undefined;
  sessionId?: string | undefined;
  maxDiffs?: number | undefined;
}): Promise<void> => {
  const client = await createClientWithOAuth({
    apiToken: opts.apiToken,
    enableOAuthLogin: true,
  });

  await runDebugPipeline({
    client,
    workspaceName: opts.workspaceName,
    screenshot: opts.screenshot,
    replayDiffId: opts.replayDiffId,
    testRunId: opts.testRunId,
    replayIds: opts.replayIds,
    sessionId: opts.sessionId,
    maxDiffs: opts.maxDiffs,
    createWorktree: (ctx, workspaceDir) =>
      createProjectWorktree({ debugContext: ctx, workspaceDir }),
    onWorkspaceReady: (workspaceDir, projectRepoDir) =>
      presentWorkspace({ workspaceDir, projectRepoDir }),
  });
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
    await runPipeline({
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
    await runPipeline({
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
    await runPipeline({
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
  builder: (yargs) =>
    yargs.option("all", {
      boolean: true,
      description:
        "Delete all workspaces without prompting (useful for non-interactive environments)",
      default: false,
    }),
  handler: wrapHandler(async (args) => {
    await cleanWorkspaces({
      all: args.all,
      beforeDelete: removeProjectWorktree,
    });
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
