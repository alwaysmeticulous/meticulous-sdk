import { existsSync } from "fs";
import { resolve } from "path";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { buildOnboardContext } from "./build-context";
import { confirmVcsLinkIfNeeded } from "./check-vcs-link";
import { detectFramework } from "./detect-framework";
import { assertGitRepo } from "./git-repo-info";
import {
  defaultOnboardPrompt,
  launchOnboardTool,
  printManualLaunchInstructions,
  printNextSteps,
  printPreLaunchNotice,
  resolveOnboardTool,
  type OnboardAgentChoice,
} from "./launch-agent";
import {
  materializeOnboardWorkspace,
  updateOnboardContext,
} from "./materialize-workspace";
import { printOnboardSummary } from "./print-summary";
import { assertSupportedSsr, resolveSelectedApp } from "./resolve-app";
import { resolveSelectedAppAbsolutePath } from "./discover-apps";
import { resolveOnboardProject } from "./resolve-project";
import { setupAgentIntegrations } from "./setup-agent-integrations";

interface OnboardOptions {
  apiToken: string | undefined;
  cwd: string | undefined;
  project: string | undefined;
  app: string | undefined;
  agent: OnboardAgentChoice;
  model: string | undefined;
  prompt: string | undefined;
  headless: boolean;
  auto: boolean;
  printOnly: boolean;
  skipSsrCheck: boolean;
}

const handler = async (options: OnboardOptions): Promise<void> => {
  const projectRoot = resolve(options.cwd ?? process.cwd());
  if (!existsSync(projectRoot)) {
    throw new Error(`Directory not found: ${projectRoot}`);
  }
  assertGitRepo(projectRoot);

  const project = await resolveOnboardProject({
    apiToken: options.apiToken,
    project: options.project,
  });

  const selectedApp = await resolveSelectedApp({
    projectRoot,
    app: options.app,
  });
  const selectedAppAbsolutePath = resolveSelectedAppAbsolutePath(
    projectRoot,
    selectedApp.path,
  );

  const frameworkDetection = detectFramework(selectedAppAbsolutePath);
  await assertSupportedSsr({
    detection: frameworkDetection,
    selectedApp,
    skipSsrCheck: options.skipSsrCheck,
  });

  const context = buildOnboardContext({
    projectRoot,
    project,
    selectedApp,
    selectedAppAbsolutePath,
    frameworkDetection,
  });

  // Linking is optional for the install itself, but raise it before the first
  // repo write so opting out costs nothing.
  await confirmVcsLinkIfNeeded({ project, context });

  const workspaceDir = materializeOnboardWorkspace({ projectRoot, context });

  printOnboardSummary({
    context,
    frameworkDetection,
    projectRoot,
    workspaceDir,
  });

  const prompt =
    options.prompt ?? defaultOnboardPrompt({ headless: options.headless });

  // Skills/MCP are installed for every supported agent, so this is independent
  // of the tool choice. Run it here, during the CLI stage, before the picker:
  // the agent CLIs take over the terminal on launch, which would hide this.
  context.agentIntegrationPaths = setupAgentIntegrations({ projectRoot });
  updateOnboardContext({ projectRoot, workspaceDir, context });

  if (options.printOnly) {
    printManualLaunchInstructions({ workspaceDir, projectRoot, prompt });
    return;
  }

  printPreLaunchNotice({
    selectedAppLabel: `${selectedApp.name} (${selectedApp.path})`,
  });

  const tool = await resolveOnboardTool(options.agent);
  if (!tool) {
    printManualLaunchInstructions({ workspaceDir, projectRoot, prompt });
    return;
  }

  const exitCode = launchOnboardTool({
    workspaceDir,
    projectRoot,
    tool,
    model: options.model,
    prompt,
    headless: options.headless,
    auto: options.auto,
  });
  printNextSteps({
    tool,
    context,
  });
  process.exitCode = exitCode;
};

export const onboardCommand: CommandModule<unknown, OnboardOptions> = {
  command: "onboard",
  describe:
    "Install Meticulous in this repo using your local Claude Code / Codex (no Meticulous-hosted inference)",
  builder: {
    apiToken: OPTIONS.apiToken,
    cwd: {
      string: true,
      description: "Path to the application repository (defaults to cwd)",
    },
    project: {
      string: true,
      description:
        "Meticulous project to onboard (`organization/name` or id). " +
        "Skips the interactive picker. Required in non-interactive environments.",
    },
    app: {
      string: true,
      description:
        "Frontend app path or package name to onboard in a monorepo " +
        "(e.g. `apps/web`). Skips the app picker.",
    },
    agent: {
      string: true,
      choices: ["auto", "claude", "codex"] as const,
      default: "auto",
      description:
        "Which tool to open the install in (auto = prompt for Claude Code / Codex)",
    },
    model: {
      string: true,
      description: "Optional model override passed to the agent CLI",
    },
    prompt: {
      string: true,
      description: "Override the default install prompt",
    },
    headless: {
      boolean: true,
      default: false,
      description: "Run the agent non-interactively (-p / exec)",
    },
    auto: {
      boolean: true,
      default: false,
      description:
        "Request autonomous edit mode from the agent CLI (Claude acceptEdits / Codex workspace-write)",
    },
    printOnly: {
      boolean: true,
      default: false,
      description:
        "Only materialize the onboard workspace and print how to open Claude/Codex",
    },
    skipSsrCheck: {
      boolean: true,
      default: false,
      hidden: true,
      description:
        "Bypass the unsupported-SSR gate (support escape hatch; not advertised)",
    },
  },
  handler: wrapHandler(async (argv) => {
    await handler({
      apiToken: argv.apiToken,
      cwd: argv.cwd,
      project: argv.project,
      app: argv.app,
      agent: argv.agent,
      model: argv.model,
      prompt: argv.prompt,
      headless: argv.headless,
      auto: argv.auto,
      printOnly: argv.printOnly,
      skipSsrCheck: argv.skipSsrCheck,
    });
  }),
};
