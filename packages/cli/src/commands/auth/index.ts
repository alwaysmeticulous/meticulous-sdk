import type { CommandModule } from "yargs";
import { listProjectsCommand } from "./list-projects.command";
import { loginCommand } from "./login.command";
import { logoutCommand } from "./logout.command";
import { setProjectCommand } from "./set-project.command";
import { unsetProjectCommand } from "./unset-project.command";
import { whoamiCommand } from "./whoami.command";

export const authCommand: CommandModule = {
  command: "auth",
  describe: "Authentication commands",
  builder: (yargs) =>
    yargs
      .command(loginCommand)
      .command(whoamiCommand)
      .command(logoutCommand)
      .command(setProjectCommand)
      .command(unsetProjectCommand)
      .command(listProjectsCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
