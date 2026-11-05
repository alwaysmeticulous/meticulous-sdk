import type { CommandModule } from "yargs";
import { candidatePrsCommand } from "./candidate-prs/candidate-prs.command";
import { loginCommand } from "./login/login.command";
import { recipeCommand } from "./recipe/recipe.command";
import { resultsCommand } from "./results/results.command";
import { waitForSessionsCommand } from "./sessions/wait-for-sessions.command";
import { tryStartCommand } from "./start.command";
import { cleanupCommand, worktreeCommand } from "./worktree/worktree.command";

export const tryCommand: CommandModule = {
  command: "try",
  describe:
    "Try Meticulous on this repo with only a Meticulous login: Claude Code records your app and backtests recent PRs",
  builder: (yargs) =>
    yargs
      .command(tryStartCommand)
      .command(candidatePrsCommand)
      .command(loginCommand)
      .command(worktreeCommand)
      .command(cleanupCommand)
      .command(recipeCommand)
      .command(waitForSessionsCommand)
      .command(resultsCommand)
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
