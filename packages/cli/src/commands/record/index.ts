import type { CommandModule } from "yargs";
import { recordBackendCommand } from "./backend.command";
import { recordLoginCommand } from "./login.command";
import { recordSessionCommand } from "./session.command";

export const recordCommand: CommandModule = {
  command: "record",
  describe: "Record commands",
  builder: (yargs) =>
    yargs
      .command(recordSessionCommand)
      .command(recordLoginCommand)
      .command(recordBackendCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
