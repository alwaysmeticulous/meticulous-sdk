import type { CommandModule } from "yargs";
import { jsCoverageDiffCommand } from "./js-coverage-diff.command";
import { jsCoverageCommand } from "./js-coverage.command";
import { domDiffCommand } from "./screenshot-dom-diff.command";
import { imageFilesCommand } from "./screenshot-image-files.command";
import { imageUrlsCommand } from "./screenshot-image.command";
import { testRunDiffsCommand } from "./test-run-diffs.command";
import { testRunForCommitCommand } from "./test-run-for-commit.command";
import { timelineDiffCommand } from "./timeline.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe: "Agent analysis commands for test run diffs",
  builder: (yargs) =>
    yargs
      .command(testRunDiffsCommand)
      .command(domDiffCommand)
      .command(testRunForCommitCommand)
      .command(jsCoverageCommand)
      .command(jsCoverageDiffCommand)
      .command(imageFilesCommand)
      .command(imageUrlsCommand)
      .command(timelineDiffCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
