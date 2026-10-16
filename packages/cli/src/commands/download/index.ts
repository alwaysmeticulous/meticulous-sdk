import type { CommandModule } from "yargs";
import { downloadReplayCommand } from "./replay.command";
import { downloadSessionCommand } from "./session.command";
import { downloadTestRunCommand } from "./test-run.command";

export const downloadCommand: CommandModule = {
  command: "download",
  describe: "Download Meticulous data to the local data directory.",
  builder: (yargs) =>
    yargs
      .command(downloadSessionCommand)
      .command(downloadReplayCommand)
      .command(downloadTestRunCommand)
      .option("verbose", {
        boolean: true,
        default: false,
        description:
          "Print additional logs like progress updates. Without it, only the path(s) the data was written to are printed.",
      })
      .option("json", {
        boolean: true,
        default: false,
        description:
          "Output the result as JSON. Only stdout is affected — progress and " +
          "notices still go to stderr — and stdout is always valid JSON.",
      })
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
