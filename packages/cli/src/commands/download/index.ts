import { CommandModule } from "yargs";
import { downloadReplayCommand } from "./replay.command";
import { downloadSessionCommand } from "./session.command";
import { downloadSessionsCommand } from "./sessions.command";
import { downloadTestRunCommand } from "./test-run.command";

export const downloadCommand: CommandModule = {
  command: "download",
  describe: "Download commands",
  builder: (yargs) =>
    yargs
      .command(downloadSessionCommand)
      .command(downloadSessionsCommand)
      .command(downloadReplayCommand)
      .command(downloadTestRunCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
