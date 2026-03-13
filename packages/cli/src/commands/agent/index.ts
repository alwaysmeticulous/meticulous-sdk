import { CommandModule } from "yargs";
import { screenshotDomDiffCommand } from "./screenshot-dom-diff.command";
import { screenshotImageCommand } from "./screenshot-image.command";
import { testRunDiffsCommand } from "./test-run-diffs.command";
import { timelineCommand } from "./timeline.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe: "Agent analysis commands for test run diffs",
  builder: (yargs) =>
    yargs
      .command(testRunDiffsCommand)
      .command(screenshotDomDiffCommand)
      .command(screenshotImageCommand)
      .command(timelineCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
