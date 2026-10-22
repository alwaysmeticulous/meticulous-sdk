import type { CommandModule } from "yargs";
import { tracesUploadCommand } from "./upload.command";

export const tracesCommand: CommandModule = {
  command: "traces",
  describe: "Coding-agent session traces",
  builder: (yargs) => yargs.command(tracesUploadCommand).demandCommand().help(),
  handler: () => {
    // subcommand handles this
  },
};
