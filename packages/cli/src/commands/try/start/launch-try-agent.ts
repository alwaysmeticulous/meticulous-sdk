import chalk from "chalk";
import { CliUserError } from "../../../utils/cli-user-error";
import { isToolInstalled, launchOnboardTool } from "../../onboard/launch-agent";

const CLAUDE_INSTALL_HINT =
  "Install Claude Code: npm install -g @anthropic-ai/claude-code — https://docs.anthropic.com/en/docs/claude-code/setup";

export const assertClaudeInstalled = (): void => {
  if (!isToolInstalled("claude")) {
    throw new CliUserError(
      `\`meticulous try\` runs in Claude Code, which is not on your PATH.\n${CLAUDE_INSTALL_HINT}\n` +
        "Or re-run with --printOnly to just prepare the workspace.",
    );
  }
};

/** Launches Claude Code in the workspace with the trial project's token in its environment. */
export const launchTryAgent = (options: {
  workspaceDir: string;
  projectRoot: string;
  model: string;
  prompt: string;
  headless: boolean;
  apiToken: string;
}): number =>
  launchOnboardTool({
    tool: "claude",
    workspaceDir: options.workspaceDir,
    projectRoot: options.projectRoot,
    model: options.model,
    prompt: options.prompt,
    headless: options.headless,
    auto: false,
    claudePermissionMode: "auto",
    env: { METICULOUS_API_TOKEN: options.apiToken },
  });

/**
 * The token is read from try-context.json at launch time rather than printed,
 * so it never lands in terminal scrollback.
 */
export const printTryManualLaunch = (options: {
  workspaceDir: string;
  projectRoot: string;
  model: string;
  prompt: string;
}): void => {
  const escapedPrompt = options.prompt.replace(/(["\\$`])/g, "\\$1");
  const tokenFromContext = `"$(node -p "require('./try-context.json').apiToken")"`;
  console.log("");
  console.log(chalk.bold.green("Meticulous try workspace ready!"));
  console.log(`  ${chalk.cyan("Workspace:")} ${options.workspaceDir}`);
  console.log(`  ${chalk.cyan("Repo:")}      ${options.projectRoot}`);
  console.log("");
  console.log(chalk.bold("  Start it in Claude Code:"));
  console.log("");
  console.log(
    `    cd "${options.workspaceDir}" && METICULOUS_API_TOKEN=${tokenFromContext} claude "${escapedPrompt}" --model ${options.model} --permission-mode auto --add-dir "${options.projectRoot}"`,
  );
  console.log("");
};
