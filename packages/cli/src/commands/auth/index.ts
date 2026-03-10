import { CommandModule } from "yargs";
import { logoutCommand } from "./logout.command";
import { whoamiCommand } from "./whoami.command";

export const authCommand: CommandModule = {
  command: "auth",
  describe: "Authentication commands",
  builder: (yargs) =>
    yargs.command(whoamiCommand).command(logoutCommand).demandCommand().help(),
  handler: () => {
    // subcommand handles this
  },
};
