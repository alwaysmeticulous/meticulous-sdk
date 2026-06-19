import { CommandModule } from "yargs";
import { jsCoverageDiffCommand } from "./js-coverage-diff.command";
import { jsCoverageCommand } from "./js-coverage.command";
import { domDiffCommand } from "./screenshot-dom-diff.command";
import { imageFilesCommand } from "./screenshot-image-files.command";
import { imageUrlsCommand } from "./screenshot-image.command";
import { testRunDiffsCommand } from "./test-run-diffs.command";
import { testRunForCommitCommand } from "./test-run-for-commit.command";
import { timelineDiffCommand } from "./timeline.command";
import { triggerTestRunCommand } from "./trigger-test-run/trigger-test-run.command";
import { uploadBuildCommand } from "./upload-build.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe: "Agent commands for triggering and analysing test runs",
  builder: (yargs) =>
    yargs
      .command(uploadBuildCommand)
      .command(triggerTestRunCommand)
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
