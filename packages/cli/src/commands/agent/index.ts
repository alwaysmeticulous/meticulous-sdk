import type { CommandModule } from "yargs";
import { jsCoverageDiffCommand } from "./js-coverage-diff.command";
import { jsCoverageCommand } from "./js-coverage.command";
import { domDiffCommand } from "./screenshot-dom-diff.command";
import { imageFilesCommand } from "./screenshot-image-files.command";
import { imageUrlsCommand } from "./screenshot-image.command";
import { sessionsCommand } from "./sessions.command";
import { testRunDiffsCommand } from "./test-run-diffs.command";
import { testRunForCommitCommand } from "./test-run-for-commit.command";
import { timelineDiffCommand } from "./timeline.command";
import { triggerTestRunCommand } from "./trigger-test-run.command";
import { uploadBuildCommand } from "./upload-build.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe:
    "Agent commands for retrieving data from and interacting with Meticulous.",
  builder: (yargs) =>
    yargs
      .command(testRunForCommitCommand)
      .command(testRunDiffsCommand)
      .command(imageFilesCommand)
      .command(imageUrlsCommand)
      .command(domDiffCommand)
      .command(timelineDiffCommand)
      .command(jsCoverageCommand)
      .command(jsCoverageDiffCommand)
      .command(uploadBuildCommand)
      .command(triggerTestRunCommand)
      .command(sessionsCommand)
      .option("verbose", {
        boolean: true,
        default: false,
        description:
          "Print additional logs like progress updates. Without it, only the actual output value or table is printed.",
      })
      .option("json", {
        boolean: true,
        default: false,
        description:
          "Output the result as JSON. Only stdout is affected — progress and " +
          "notices still go to stderr — and stdout is always valid JSON, " +
          "including an empty array/object when there is no result.",
      })
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
