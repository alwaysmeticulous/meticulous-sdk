import { CommandModule } from "yargs";
import { relevantSessionsCommand } from "./relevant-sessions.command";

export const localCommand: CommandModule = {
  command: "local",
  describe: "Local commands",
  builder: (yargs) =>
    yargs.command(relevantSessionsCommand).demandCommand().help(),
  handler: () => {
    // subcommand handles this
  },
};
