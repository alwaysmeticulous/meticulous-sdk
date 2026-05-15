import { CommandModule } from "yargs";
import { logoutCommand } from "./logout.command";
import { setProjectCommand } from "./set-project.command";
import { unsetProjectCommand } from "./unset-project.command";
import { whoamiCommand } from "./whoami.command";

export const authCommand: CommandModule = {
  command: "auth",
  describe: "Authentication commands",
  builder: (yargs) =>
    yargs
      .command(whoamiCommand)
      .command(logoutCommand)
      .command(setProjectCommand)
      .command(unsetProjectCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
