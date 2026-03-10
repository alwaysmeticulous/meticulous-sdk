import { CommandModule } from "yargs";
import { showCommand } from "./show.command";

export const projectCommand: CommandModule = {
  command: "project",
  describe: "Project commands",
  builder: (yargs) => yargs.command(showCommand).demandCommand().help(),
  handler: () => {
    // subcommand handles this
  },
};
