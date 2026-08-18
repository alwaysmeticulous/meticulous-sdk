import { execSync, spawnSync } from "child_process";
import { existsSync } from "fs";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  GITHUB_ACTIONS_DOCS_URL,
  METICULOUS_DOCS_BASE_URL,
  METICULOUS_DOCS_HOST,
} from "./docs-urls";

/** Agents we can launch to actually run the install. */
export type LaunchableAgent = "claude" | "codex";
/** Tools that can apply the install (Cursor is not offered in the picker). */
export type OnboardTool = LaunchableAgent;
export type OnboardAgentChoice = OnboardTool | "auto";

const ONBOARD_PROMPT_BASE =
  "install meticulous (https://meticulous.ai) into this repository. " +
  "first read `.meticulous-onboard/.claude/CLAUDE.md` and " +
  "`.meticulous-onboard/.claude/onboard-context.json` — they define the workflow, the " +
  "customer-facing specialist agents in `.claude/agents/`, and the project context. " +
  "stay scoped to `selectedAppPath` from onboard-context.json (the cli already asked which " +
  "monorepo app to use when needed). if review finds ssr that is not next.js pages router " +
  "ssr, say so and let the user decide before you apply anything — the cli already asked the " +
  "user whether to continue despite its ssr warning, so validate it and do not abort on your " +
  "own guess. " +
  "steps: (1) run the reviewer agent first (scoped to the selected app) and wait for its " +
  "structured summary; " +
  "(2) if `isMonorepo` is true but `selectedAppPath` is missing, ask which app to onboard " +
  "and wait; otherwise do not re-ask; " +
  "(3) dispatch every applicable specialist (recorder-installation, ci-setup, " +
  "false-positive-prevention, local-simulation-verification, plus any conditional ones the " +
  "reviewer flags) in a single parallel task message; " +
  "(4) post a short plan (recorder approach, ci change, each conditional fix and the file it " +
  "touches, anything needing meticulous-side setup, how you will split the prs, manual " +
  "follow-ups) and wait for the user to approve or amend it before editing any repo file; " +
  "(5) apply the approved plan in the real repo with small, correct diffs — install the " +
  "recorder under the selected app, add the ci job at the repo root (monorepo-aware when " +
  "needed), and only the conditional fixes the review says are needed. " +
  "if anything needs work on the meticulous side rather than in the repo (websockets, unusual " +
  "auth, central network mocking), write the file at the absolute path in " +
  "`onboard-context.json` → `meticulousSideSetupPath` (never a relative path — your cwd is the " +
  "onboard workspace, not the repo) describing what you found and what you need from " +
  "meticulous, and tell the user to send that file to their meticulous contact, quoting its " +
  "absolute path — do not commit it. " +
  "the specialist playbooks cite docs as `.claude/docs/<path>.ts`; those files are bundled in " +
  "this workspace — read them locally (they are the authoritative recorder snippet and ci yaml, " +
  "including gitlab and bitbucket). only if one is missing, fetch " +
  `\`${METICULOUS_DOCS_BASE_URL}/<path>\` (\`${METICULOUS_DOCS_HOST}\` is pre-approved for ` +
  "webfetch), knowing fetched pages omit client-rendered snippet and non-default ci tab content " +
  "— see the reference docs section of CLAUDE.md. " +
  "this is a single pass: run the reviewer once and the specialists once, then apply and open " +
  "the pr. after applying do not re-dispatch the reviewer or specialists to double-check, and " +
  "do not build, run, or `meticulous simulate` the app yourself — verification (local " +
  "simulation, first test run) is a post-merge step for the customer and goes only in the pr " +
  "next steps. confirm edits with static read-backs, not by executing the app. " +
  "the cli has already added project-scoped meticulous skills (for claude code, codex, and " +
  "cursor), mcp configuration, and a `.gitignore` entry. you must include every path in " +
  "`onboard-context.json` → `agentIntegrationPaths` in the onboarding pr (skills + mcp). " +
  "the required final output is a pull request: create a new branch, commit your install " +
  "changes plus those agent integration files " +
  "(never the .meticulous-onboard workspace and never secrets), push to origin, and open a pr " +
  "with `gh pr create` (or `glab mr create` on gitlab). default to one pr; only split into " +
  "several (recorder + ci + skills first, compatibility fixes after, each cross-linked) if the " +
  "user approved that split in the plan. the pr description must list what was " +
  "installed first, then end with next steps for the reviewer (recording token and project " +
  "api token from `meticulousTokensUrl` in onboard-context.json; recording token is a public " +
  "read-only token suitable for build-time frontend env vars; api token stored in " +
  "`secretsUrl` / `{secretsUrlLabel}`, and any remaining manual steps). if the pr cli is missing or " +
  "unauthenticated, still commit and push the branch, then print the exact `gh pr create` " +
  "command and compare url. finish by printing the pr url (or the branch name + command).";

/**
 * The install prompt. Headless runs have nobody to approve the plan, so they
 * post it and keep going instead of waiting.
 */
export const defaultOnboardPrompt = (options: { headless: boolean }): string =>
  options.headless
    ? `${ONBOARD_PROMPT_BASE} this run is non-interactive: post the plan in step 4 for the record and continue without waiting for approval.`
    : ONBOARD_PROMPT_BASE;

/**
 * Printed before the tool picker so the time cost and scope of the run are
 * known before the user commits to a tool.
 */
export const printPreLaunchNotice = (options: {
  selectedAppLabel: string;
}): void => {
  console.log(chalk.bold("What happens next"));
  console.log(
    `  An agent reviews ${chalk.cyan(options.selectedAppLabel)}, applies the Meticulous install, and opens a pull request.`,
  );
  console.log(
    `  ${chalk.yellow("This usually takes 15–30 minutes")} depending on the size of the project — keep this terminal open.`,
  );
  console.log(
    chalk.dim(
      "  Model usage is billed to your own Claude Code / Codex account.",
    ),
  );
  console.log("");
};

const TOOL_LABEL: Record<OnboardTool, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

const TOOL_COMMAND: Record<OnboardTool, string> = {
  claude: "claude",
  codex: "codex",
};

const INSTALL_HINT: Record<OnboardTool, string> = {
  claude:
    "Install: npm install -g @anthropic-ai/claude-code — https://docs.anthropic.com/en/docs/claude-code/setup",
  codex:
    "Install: npm install -g @openai/codex — https://github.com/openai/codex",
};

export const isToolInstalled = (tool: OnboardTool): boolean => {
  try {
    execSync(`which ${TOOL_COMMAND[tool]}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/**
 * Interactively asks which tool to open the workspace in, defaulting to the
 * first installed option. Installed tools are listed first; missing ones are
 * shown disabled with an install hint. Returns null when the terminal is not
 * interactive (caller should fall back to printed instructions).
 */
export const promptForTool = async (): Promise<OnboardTool | null> => {
  if (!process.stdin.isTTY) {
    return null;
  }

  // Cursor is intentionally omitted from the picker — Claude Code / Codex can
  // drive the install end-to-end; Cursor still gets skills + MCP in the PR.
  const order: LaunchableAgent[] = ["claude", "codex"];
  const installed = order.filter(isToolInstalled);
  const choices = order.map((tool) => {
    const ready = installed.includes(tool);
    return {
      name: ready
        ? TOOL_LABEL[tool]
        : `${TOOL_LABEL[tool]} ${chalk.dim("(not installed)")}`,
      value: tool,
    };
  });

  const { tool } = await inquirer.prompt<{ tool: LaunchableAgent }>([
    {
      type: "list",
      name: "tool",
      message:
        "Which tool should apply the Meticulous install? (15–30 min run)",
      choices,
      default: installed[0] ?? "claude",
    },
  ]);
  return tool;
};

/**
 * Resolves the requested `--agent` choice to a concrete tool. `auto` prompts
 * when interactive, otherwise falls back to the first installed agent. Returns
 * null when no agent can be launched (caller prints manual instructions).
 */
export const resolveOnboardTool = async (
  requested: OnboardAgentChoice,
): Promise<OnboardTool | null> => {
  if (requested !== "auto") {
    return requested;
  }

  const picked = await promptForTool();
  if (picked) {
    return picked;
  }

  if (isToolInstalled("claude")) {
    return "claude";
  }
  if (isToolInstalled("codex")) {
    return "codex";
  }
  console.log(
    chalk.yellow(
      "Neither Claude Code nor Codex CLI found on PATH — printing manual instructions.",
    ),
  );
  return null;
};

export const launchOnboardTool = (options: {
  workspaceDir: string;
  projectRoot: string;
  tool: OnboardTool;
  model: string | undefined;
  prompt: string;
  headless: boolean;
  auto: boolean;
}): number => {
  const { tool, projectRoot, workspaceDir } = options;

  if (!isToolInstalled(tool)) {
    console.error(
      chalk.red(
        `${TOOL_LABEL[tool]} is not installed (\`which ${TOOL_COMMAND[tool]}\` failed).`,
      ),
    );
    console.error(INSTALL_HINT[tool]);
    return 1;
  }

  return launchAgent({
    tool,
    workspaceDir,
    projectRoot,
    model: options.model,
    prompt: options.prompt,
    headless: options.headless,
    auto: options.auto,
  });
};

const launchAgent = (options: {
  tool: LaunchableAgent;
  workspaceDir: string;
  projectRoot: string;
  model: string | undefined;
  prompt: string;
  headless: boolean;
  auto: boolean;
}): number => {
  const { tool, workspaceDir, projectRoot, headless, auto, prompt } = options;
  const model = options.model ?? (tool === "claude" ? "opus" : undefined);
  const args = buildAgentArgs({
    tool,
    model,
    prompt,
    headless,
    auto,
    projectRoot,
  });

  console.log(
    chalk.bold(
      `Launching ${TOOL_LABEL[tool]}${headless ? " (headless)" : ""}…`,
    ),
  );
  console.log(
    chalk.dim(
      `  Inference uses your local ${tool === "claude" ? "Anthropic" : "OpenAI"} credentials — Meticulous does not proxy the model.`,
    ),
  );
  console.log("");

  const result = spawnSync(TOOL_COMMAND[tool], args, {
    cwd: workspaceDir,
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.error) {
    console.error(
      `Failed to launch ${TOOL_LABEL[tool]}: ${result.error.message}`,
    );
    return 1;
  }
  return result.status ?? 1;
};

export const printNextSteps = (options: {
  tool: OnboardTool;
  context: {
    orgAndProject: string | null;
    meticulousSideSetupPath: string;
    meticulousTokensUrl: string | null;
    secretsUrl: string | null;
    secretsUrlLabel: string | null;
    githubConfigureProjectsUrl: string | null;
    gitlabConfigureProjectsUrl: string | null;
    bitbucketConfigureProjectsUrl: string | null;
    isGitHubIntegrationActive: boolean | null;
    isGitLabIntegrationActive: boolean | null;
    isBitbucketIntegrationActive: boolean | null;
    ciProvider:
      | "github-actions"
      | "gitlab-ci"
      | "bitbucket-pipelines"
      | "unknown";
  };
}): void => {
  const { tool, context } = options;
  const projectLabel = context.orgAndProject ?? "your Meticulous project";
  const tokensUrl =
    context.meticulousTokensUrl ??
    "https://app.meticulous.ai (Project → Settings → Tokens)";
  const secretsLabel = context.secretsUrlLabel ?? "your CI secrets";

  const steps = [
    `In ${TOOL_LABEL[tool]}, authenticate the Meticulous MCP when prompted (browser OAuth).`,
    `Grab the recording token and project API token from ${chalk.cyan(tokensUrl)}.`,
    `Put the recording token in a build-time frontend env var (it is a public, read-only token), and put the API token in ${secretsLabel}${
      context.secretsUrl ? ` (${chalk.cyan(context.secretsUrl)})` : ""
    } for ${chalk.cyan(projectLabel)}.`,
    unresolvedVcsLinkStep(context),
    meticulousSideSetupStep(context.meticulousSideSetupPath),
    "Merge the PR, then confirm sessions appear in the Meticulous dashboard.",
  ].filter((step): step is string => step !== null);

  console.log("");
  console.log(chalk.bold("Next steps"));
  steps.forEach((step, index) => {
    console.log(`  ${index + 1}. ${step}`);
  });
  console.log("");
};

/** Surfaces the hand-back file when the agent found work for us to do. */
const meticulousSideSetupStep = (setupPath: string): string | null => {
  if (!existsSync(setupPath)) {
    return null;
  }
  return (
    `Send ${chalk.cyan(setupPath)} to your Meticulous contact (or support@meticulous.ai) — ` +
    "it lists setup this project needs on the Meticulous side."
  );
};

const unresolvedVcsLinkStep = (context: {
  ciProvider:
    | "github-actions"
    | "gitlab-ci"
    | "bitbucket-pipelines"
    | "unknown";
  githubConfigureProjectsUrl: string | null;
  gitlabConfigureProjectsUrl: string | null;
  bitbucketConfigureProjectsUrl: string | null;
  isGitHubIntegrationActive: boolean | null;
  isGitLabIntegrationActive: boolean | null;
  isBitbucketIntegrationActive: boolean | null;
}): string | null => {
  switch (context.ciProvider) {
    case "github-actions":
      return linkStepFor(
        context.isGitHubIntegrationActive,
        GITHUB_ACTIONS_DOCS_URL,
      );
    case "gitlab-ci":
      return linkStepFor(
        context.isGitLabIntegrationActive,
        context.gitlabConfigureProjectsUrl,
      );
    case "bitbucket-pipelines":
      return linkStepFor(
        context.isBitbucketIntegrationActive,
        context.bitbucketConfigureProjectsUrl,
      );
    default:
      return null;
  }
};

const linkStepFor = (
  linked: boolean | null,
  configureUrl: string | null,
): string | null => {
  if (linked !== false) {
    return null;
  }
  return configureUrl
    ? `Link the repo to Meticulous at ${chalk.cyan(configureUrl)}.`
    : "Link the repo to Meticulous in your project settings.";
};

export const printManualLaunchInstructions = (options: {
  workspaceDir: string;
  projectRoot: string;
  prompt: string;
}): void => {
  const { workspaceDir, projectRoot, prompt } = options;
  const escapedPrompt = prompt.replace(/"/g, '\\"');

  console.log("");
  console.log(chalk.bold.green("Onboard workspace ready!"));
  console.log("");
  console.log(`  ${chalk.cyan("Workspace:")} ${workspaceDir}`);
  console.log(`  ${chalk.cyan("Repo:")}      ${projectRoot}`);
  console.log("");
  console.log(chalk.bold("  Open in your preferred tool:"));
  console.log("");
  console.log(
    chalk.dim(
      "  This can take 15–30 minutes depending on the size of the project.",
    ),
  );
  console.log("");
  console.log(
    `    ${chalk.cyan("Claude Code:")}  cd "${workspaceDir}" && claude "${escapedPrompt}" --add-dir "${projectRoot}"`,
  );
  console.log(
    `    ${chalk.cyan("Codex:")}        cd "${workspaceDir}" && codex "${escapedPrompt}" --sandbox workspace-write --add-dir "${projectRoot}"`,
  );
  console.log("");
  console.log(
    chalk.dim(
      "  The agent applies the install and opens a pull request with the changes.",
    ),
  );
  console.log(
    chalk.dim(
      "  Model usage is billed to your own Claude Code / Codex account.",
    ),
  );
  console.log("");
};

/**
 * `--add-dir <directories...>` is variadic in both CLIs, so the prompt must
 * never follow it — it would be parsed as another directory (and a long prompt
 * then fails with ENAMETOOLONG). Keep the prompt first and `--add-dir` last.
 */
const buildAgentArgs = (options: {
  tool: LaunchableAgent;
  model: string | undefined;
  prompt: string;
  headless: boolean;
  auto: boolean;
  projectRoot: string;
}): string[] => {
  const { tool, model, prompt, headless, auto, projectRoot } = options;
  const modelArgs = model ? ["--model", model] : [];
  const addDir = ["--add-dir", projectRoot];

  if (tool === "claude") {
    const autoArgs = auto ? ["--permission-mode", "acceptEdits"] : [];
    if (headless) {
      return ["-p", prompt, ...modelArgs, ...autoArgs, ...addDir];
    }
    return [prompt, ...modelArgs, ...autoArgs, ...addDir];
  }

  // Codex. The primary workspace is `.meticulous-onboard`, so the repo itself
  // is only writable via `--add-dir` — and Codex silently ignores that flag
  // under its default read-only sandbox. workspace-write is therefore required,
  // not just an `--auto` nicety; approvals still gate what actually runs.
  const sandboxArgs = ["--sandbox", "workspace-write"];
  if (headless) {
    // `codex exec` is non-interactive and takes no approval policy.
    return ["exec", prompt, ...modelArgs, ...sandboxArgs, ...addDir];
  }
  const autoArgs = auto ? ["--ask-for-approval", "on-request"] : [];
  return [prompt, ...modelArgs, ...sandboxArgs, ...autoArgs, ...addDir];
};
