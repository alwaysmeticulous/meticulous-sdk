import type { CommandModule } from "yargs";
import { candidatePrsCommand } from "./candidate-prs/candidate-prs.command";
import { loginCommand } from "./login/login.command";
import { freePortCommand } from "./ports/free-port.command";
import { preflightCommand } from "./preflight/preflight.command";
import { recipeCommand } from "./recipe/recipe.command";
import { replayFixCommand } from "./replay-fix/replay-fix.command";
import { resultsCommand } from "./results/results.command";
import { waitForSessionsCommand } from "./sessions/wait-for-sessions.command";
import { slotCommand } from "./slots/slot.command";
import { tryStartCommand } from "./start.command";
import { cleanupCommand } from "./worktree/cleanup.command";
import { prewarmCommand } from "./worktree/prewarm.command";
import { snapshotBuildCommand } from "./worktree/snapshot-build.command";
import { worktreeCommand } from "./worktree/worktree.command";

export const tryCommand: CommandModule = {
  command: "try",
  describe:
    "Try Meticulous on this repo with only a Meticulous login: Claude Code records your app and backtests recent PRs",
  builder: (yargs) =>
    yargs
      .command(tryStartCommand)
      .command(preflightCommand)
      .command(freePortCommand)
      .command(candidatePrsCommand)
      .command(loginCommand)
      .command(worktreeCommand)
      .command(prewarmCommand)
      .command(snapshotBuildCommand)
      .command(cleanupCommand)
      .command(recipeCommand)
      .command(replayFixCommand)
      .command(slotCommand)
      .command(waitForSessionsCommand)
      .command(resultsCommand)
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
