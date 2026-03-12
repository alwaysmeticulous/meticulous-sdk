import chalk from "chalk";

interface PresentWorkspaceOptions {
  workspaceDir: string;
  projectRepoDir: string | undefined;
}

export const presentWorkspace = (options: PresentWorkspaceOptions): void => {
  const { workspaceDir, projectRepoDir } = options;

  console.log("");
  console.log(chalk.bold.green("Debug workspace ready!"));
  console.log("");
  console.log(`  ${chalk.cyan("Workspace:")} ${workspaceDir}`);
  console.log("");
  console.log("  Contents:");
  console.log(
    "    debug-data/     Replay data, session recordings, diffs, and analysis artifacts",
  );
  console.log(
    "    .claude/        AI agent context files (CLAUDE.md, rules, skills, hooks)",
  );
  if (projectRepoDir) {
    console.log(
      "    project-repo/   Your codebase at the relevant commit",
    );
  }
  console.log("");
  console.log(chalk.bold("  Open in your preferred AI tool:"));
  console.log("");
  console.log(
    `    ${chalk.cyan("Claude Code:")}  cd "${workspaceDir}" && claude`,
  );
  console.log(`    ${chalk.cyan("Cursor:")}      cursor "${workspaceDir}"`);
  console.log("");
  console.log(
    "  Or open the workspace directory in any editor or AI tool of your choice.",
  );
  console.log("");
};
