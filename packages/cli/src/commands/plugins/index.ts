import { CommandModule } from "yargs";
import { executeCustomCheckLocallyCommand } from "./execute-custom-check-locally.command";

export const pluginsCommand: CommandModule = {
  command: "plugins",
  describe: "Commands for developing Meticulous plugins",
  builder: (yargs) =>
    yargs.command(executeCustomCheckLocallyCommand).demandCommand().help(),
  handler: () => {
    // subcommand handles this
  },
};
