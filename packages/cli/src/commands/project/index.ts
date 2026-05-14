import { CommandModule } from "yargs";
import { showCommand } from "./show.command";
import { uploadSourceCommand } from "./upload-source.command";

export const projectCommand: CommandModule = {
  command: "project",
  describe: "Project commands",
  builder: (yargs) =>
    yargs.command(showCommand).command(uploadSourceCommand).demandCommand().help(),
  handler: () => {
    // subcommand handles this
  },
};
