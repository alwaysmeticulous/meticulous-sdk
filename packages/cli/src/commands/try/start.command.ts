import { join } from "path";
import { isInteractiveContext } from "@alwaysmeticulous/client";
import chalk from "chalk";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { repoRootFrom } from "./shared/helper-options";
import { readTryContext, writeTryContext } from "./shared/try-context";
import { buildTryContext } from "./start/build-try-context";
import {
  confirmContinueWithExistingWorkspace,
  hasExistingTryWorkspace,
} from "./start/confirm-existing-workspace";
import { confirmLaunch } from "./start/confirm-launch";
import { defaultTryPrompt } from "./start/kickoff-prompt";
import {
  assertClaudeInstalled,
  launchTryAgent,
  printTryManualLaunch,
} from "./start/launch-try-agent";
import { materializeTryWorkspace } from "./start/materialize-try-workspace";
import { deriveProjectName, detectPackageManager } from "./start/repo-facts";
import { resolveTryApp } from "./start/resolve-try-app";
import { selfOnboardProject } from "./start/self-onboard-project";
import { defaultBuildSlots } from "./slots/default-build-slots";
import {
  assertNotInsideTryWorkspace,
  removeTryWorkspace,
} from "./worktree/remove-workspace";
import { CLI_COMMAND } from "./shared/cli-command";
import { TRY_WORKDIR } from "./shared/try-paths";

const MIN_PRS = 5;
const MAX_PRS = 10;

interface StartOptions {
  cwd: string | undefined;
  app: string | undefined;
  model: string;
  prs: number;
  prompt: string | undefined;
  headless: boolean;
  printOnly: boolean;
  buildSlots: number | undefined;
  lowPriority: boolean;
}

const handler = async (options: StartOptions): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  if (!options.printOnly) {
    assertClaudeInstalled();
  }

  const startFresh = await shouldDiscardExistingWorkspace(options, repoRoot);
  if (startFresh) {
    assertNotInsideTryWorkspace(
      repoRoot,
      `Run \`${CLI_COMMAND} try\` from the repository root to start fresh.`,
    );
    removeTryWorkspace(repoRoot);
    console.log(
      `Removed ${TRY_WORKDIR}/ — starting from scratch in a new trial project.`,
    );
  }

  const apps = await resolveTryApp({ projectRoot: repoRoot, app: options.app });
  const repoName = deriveProjectName(repoRoot);
  // A continued run must stay in the project the workspace was created for,
  // which a previous fresh start may have given a suffixed name.
  const previousProjectName = startFresh
    ? null
    : readTryContext(repoRoot)?.project.name;
  const onboarded = await selfOnboardProject(previousProjectName ?? repoName, {
    forceNewProject: startFresh,
  });
  const packageManager = detectPackageManager([
    repoRoot,
    ...(apps.selectedApp ? [join(repoRoot, apps.selectedApp.path)] : []),
  ]);

  const workspaceDir = materializeTryWorkspace({ repoRoot, packageManager });
  const context = buildTryContext({
    repoRoot,
    workspaceDir,
    repoName,
    onboarded,
    apps,
    packageManager,
    prCount: options.prs,
    buildSlots: options.buildSlots ?? defaultBuildSlots(),
  });
  writeTryContext(repoRoot, context);

  printSummary({
    projectLabel: `${onboarded.organization.name}/${onboarded.project.name}`,
    projectUrl: context.projectUrl,
    created: onboarded.created,
    workspaceDir,
    prCount: options.prs,
  });

  const prompt =
    options.prompt ?? defaultTryPrompt({ headless: options.headless });
  if (options.printOnly) {
    printTryManualLaunch({
      workspaceDir,
      projectRoot: repoRoot,
      model: options.model,
      prompt,
      lowPriority: options.lowPriority,
    });
    return;
  }
  if (!options.headless && isInteractiveContext() && !(await confirmLaunch())) {
    console.log(
      `Not started. Re-run \`${CLI_COMMAND} try\` when you're ready: it reuses this trial project.`,
    );
    return;
  }
  const exitCode = launchTryAgent({
    workspaceDir,
    projectRoot: repoRoot,
    model: options.model,
    prompt,
    headless: options.headless,
    apiToken: onboarded.apiToken,
    lowPriority: options.lowPriority,
  });
  printNextSteps(context.projectUrl);
  if (exitCode !== 0) {
    throw new CliUserError(
      `Claude Code exited with code ${exitCode}.`,
      exitCode,
      "warn",
    );
  }
};

/**
 * A re-run over an existing `.meticulous-try/` workspace asks whether to keep
 * it; answering no discards it so the run starts from scratch in a new trial
 * project. Non-interactive runs keep the old behavior of reusing it.
 */
const shouldDiscardExistingWorkspace = async (
  options: StartOptions,
  repoRoot: string,
): Promise<boolean> => {
  if (!hasExistingTryWorkspace(repoRoot)) {
    return false;
  }
  if (options.headless || !isInteractiveContext()) {
    return false;
  }
  return !(await confirmContinueWithExistingWorkspace());
};

const printSummary = (options: {
  projectLabel: string;
  projectUrl: string;
  created: boolean;
  workspaceDir: string;
  prCount: number;
}): void => {
  console.log("");
  console.log(
    `${options.created ? "Created" : "Reusing"} trial project ${chalk.cyan(options.projectLabel)} — ${chalk.cyan(options.projectUrl)}`,
  );
  console.log(chalk.dim(`  Workspace: ${options.workspaceDir} (gitignored)`));
  console.log("");
  console.log(chalk.bold("What happens next"));
  console.log(
    `  Claude Code builds and serves your app, records sessions of it, then replays them and runs Agent swarm against ${options.prCount} recently merged PRs to show what Meticulous would have caught.`,
  );
  console.log(
    `  ${chalk.yellow("This usually takes 30–60 minutes")} — keep this terminal open. Nothing is committed or pushed.`,
  );
  console.log(
    chalk.dim("  Model usage is billed to your own Claude Code account."),
  );
  console.log("");
};

const printNextSteps = (projectUrl: string): void => {
  console.log("");
  console.log(chalk.bold("Next steps"));
  console.log(
    `  Results: ${chalk.cyan(projectUrl)} (or \`${CLI_COMMAND} try results\`)`,
  );
  console.log(
    `  Set Meticulous up on every PR in CI: ${chalk.cyan(`${CLI_COMMAND} onboard`)}`,
  );
  console.log(
    `  When you're done, remove the trial workspace (.meticulous-try/): \`${CLI_COMMAND} try cleanup\``,
  );
  console.log("");
};

export const tryStartCommand: CommandModule<unknown, StartOptions> = {
  command: ["start", "$0"],
  describe:
    "Create a trial Meticulous project and let Claude Code backtest Meticulous against this repo's recent PRs",
  builder: {
    cwd: {
      string: true,
      description: "Path to the application repository (defaults to cwd)",
    },
    app: {
      string: true,
      description:
        "Frontend app path or package name in a monorepo (e.g. `apps/web`). Skips the app picker.",
    },
    model: {
      string: true,
      default: "opus",
      description: "Claude model to run the trial with",
    },
    prs: {
      number: true,
      default: 8,
      description: `How many recently merged PRs to backtest (${MIN_PRS}-${MAX_PRS})`,
      coerce: (value: number): number => {
        if (!Number.isInteger(value) || value < MIN_PRS || value > MAX_PRS) {
          throw new CliUserError(
            `--prs must be an integer between ${MIN_PRS} and ${MAX_PRS}.`,
          );
        }
        return value;
      },
    },
    prompt: {
      string: true,
      description: "Override the kickoff prompt",
    },
    headless: {
      boolean: true,
      default: false,
      description: "Run Claude Code non-interactively (-p)",
    },
    printOnly: {
      boolean: true,
      default: false,
      description:
        "Only create the project and workspace, and print how to start Claude Code",
    },
    buildSlots: {
      number: true,
      description:
        "How many installs and builds may run at once (default: about one per 4 cores and 4 GiB of RAM)",
      coerce: (value: number | undefined): number | undefined => {
        if (value != null && (!Number.isInteger(value) || value < 1)) {
          throw new CliUserError("--buildSlots must be a positive integer.");
        }
        return value;
      },
    },
    lowPriority: {
      boolean: true,
      default: true,
      description:
        "Run Claude Code, and the builds and browsers it starts, at low CPU priority so the machine stays responsive (--no-lowPriority to turn off)",
    },
  },
  handler: wrapHandler(handler),
};
