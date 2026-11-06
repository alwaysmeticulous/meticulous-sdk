import { existsSync } from "fs";
import { constants, setPriority } from "os";
import { delimiter, join } from "path";
import chalk from "chalk";
import { CliUserError } from "../../../utils/cli-user-error";
import { isToolInstalled, launchOnboardTool } from "../../onboard/launch-agent";
import { CLI_COMMAND } from "../shared/cli-command";

const CLAUDE_INSTALL_HINT =
  "Install Claude Code: npm install -g @anthropic-ai/claude-code — https://docs.anthropic.com/en/docs/claude-code/setup";

export const assertClaudeInstalled = (): void => {
  if (!isToolInstalled("claude")) {
    throw new CliUserError(
      `\`${CLI_COMMAND} try\` runs in Claude Code, which is not on your PATH.\n${CLAUDE_INSTALL_HINT}\n` +
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
  lowPriority: boolean;
}): number => {
  if (options.lowPriority) {
    lowerOwnPriority();
  }
  return launchOnboardTool({
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
};

/**
 * Children inherit this process's priority (its nice value on POSIX, the
 * below-normal class on Windows), so Claude Code and every install, build and
 * browser it starts yield the CPU to whatever the user is doing.
 */
const lowerOwnPriority = (): void => {
  try {
    setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // Best effort: a platform that refuses still runs the trial at normal priority.
  }
};

/**
 * The token is read from try-context.json at launch time rather than printed,
 * so it never lands in terminal scrollback.
 */
export const printTryManualLaunch = (options: {
  workspaceDir: string;
  projectRoot: string;
  model: string;
  prompt: string;
  lowPriority: boolean;
}): void => {
  const escapedPrompt = options.prompt.replace(/(["\\$`])/g, "\\$1");
  const tokenFromContext = `"$(node -p "require('./try-context.json').apiToken")"`;
  const nice =
    options.lowPriority && process.platform !== "win32" ? "nice -n 10 " : "";
  const cliBinDir = findCliBinDir();
  const path = cliBinDir ? `PATH="${cliBinDir}:$PATH" ` : "";
  console.log("");
  console.log(chalk.bold.green("Meticulous try workspace ready!"));
  console.log(`  ${chalk.cyan("Workspace:")} ${options.workspaceDir}`);
  console.log(`  ${chalk.cyan("Repo:")}      ${options.projectRoot}`);
  console.log("");
  console.log(chalk.bold("  Start it in Claude Code:"));
  console.log("");
  console.log(
    `    cd "${options.workspaceDir}" && ${path}METICULOUS_API_TOKEN=${tokenFromContext} ${nice}claude "${escapedPrompt}" --model ${options.model} --permission-mode auto --add-dir "${options.projectRoot}"`,
  );
  console.log("");
  if (!cliBinDir) {
    console.log(
      chalk.yellow(
        `  The agent runs \`meticulous …\` commands: install the CLI globally first (npm install -g @alwaysmeticulous/cli).`,
      ),
    );
    console.log("");
  }
};

/**
 * The directory the `meticulous` binary resolves from in this process. Under
 * npx that is npx's own bin directory, which is on PATH only for this process
 * and its children, so a command the user runs later must add it back. The
 * printed command is POSIX shell, which cannot take a Windows path, so Windows
 * users get the install hint instead.
 */
const findCliBinDir = (): string | null => {
  if (process.platform === "win32") {
    return null;
  }
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  return dirs.find((dir) => existsSync(join(dir, "meticulous"))) ?? null;
};
