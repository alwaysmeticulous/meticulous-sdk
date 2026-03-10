import { CommandModule } from "yargs";
import { recordLoginCommand } from "./login.command";
import { recordSessionCommand } from "./session.command";

export const recordCommand: CommandModule = {
  command: "record",
  describe: "Record commands",
  builder: (yargs) =>
    yargs
      .command(recordSessionCommand)
      .command(recordLoginCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
