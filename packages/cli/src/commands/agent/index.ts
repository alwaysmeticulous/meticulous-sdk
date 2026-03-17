import { CommandModule } from "yargs";
import { domDiffCommand } from "./screenshot-dom-diff.command";
import { imageUrlsCommand } from "./screenshot-image.command";
import { testRunDiffsCommand } from "./test-run-diffs.command";
import { timelineDiffCommand } from "./timeline.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe: "Agent analysis commands for test run diffs",
  builder: (yargs) =>
    yargs
      .command(testRunDiffsCommand)
      .command(domDiffCommand)
      .command(imageUrlsCommand)
      .command(timelineDiffCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
