import {
  createClientWithOAuth,
  AgentFeature,
  trackAgentFeatureUsage,
} from "@alwaysmeticulous/client";
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
  feature: AgentFeature;
  replayDiffId?: string | undefined;
  replayIds?: string[] | undefined;
  sessionId?: string | undefined;
}): Promise<void> => {
  const client = await createClientWithOAuth({
    apiToken: opts.apiToken,
    enableOAuthLogin: true,
  });

  // Fire-and-forget: don't block the pipeline on telemetry
  void trackAgentFeatureUsage(client, opts.feature);

  await runDebugPipeline({
    client,
    workspaceName: opts.workspaceName,
    screenshot: opts.screenshot,
    replayDiffId: opts.replayDiffId,
    replayIds: opts.replayIds,
    sessionId: opts.sessionId,
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
      feature: "debug-replay-diff",
      replayDiffId: args.replayDiffId,
      sessionId: args.sessionId,
    });
  }),
};

const replayCommand: CommandModule<any, any> = {
  command: "replay <replayId>",
  describe: "Debug a replay, optionally comparing against a base replay",
  builder: (yargs) =>
    yargs
      .positional("replayId", {
        type: "string",
        demandOption: true,
        description: "The replay ID to debug (head replay)",
      })
      .option("baseReplayId", {
        string: true,
        description: "Base replay ID to compare against",
      })
      .option("sessionId", {
        string: true,
        description: "Override the session ID",
      })
      .option(SHARED_OPTIONS),
  handler: wrapHandler(async (args) => {
    const replayIds = [args.replayId];
    if (args.baseReplayId) {
      replayIds.push(args.baseReplayId);
    }
    await runPipeline({
      apiToken: args.apiToken,
      workspaceName: args.workspaceName,
      screenshot: args.screenshot,
      feature: "debug-replay",
      replayIds,
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
    "Set up a debug workspace for investigating Meticulous replay diffs and replays",
  builder: (yargs) =>
    yargs
      .command(replayDiffCommand)
      .command(replayCommand)
      .command(cleanCommand)
      .demandCommand(1, "Please specify a debug subcommand"),
  handler: () => {
    // Handled by subcommands
  },
};
