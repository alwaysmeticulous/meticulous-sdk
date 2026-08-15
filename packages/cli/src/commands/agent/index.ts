import type { CommandModule } from "yargs";
import { diffCommentsCommand } from "./diff-comments.command";
import { jsCoverageDiffCommand } from "./js-coverage-diff.command";
import { jsCoverageCommand } from "./js-coverage.command";
import { domDiffCommand } from "./screenshot-dom-diff.command";
import { imageFilesCommand } from "./screenshot-image-files.command";
import { imageUrlsCommand } from "./screenshot-image.command";
import { sessionsCommand } from "./sessions.command";
import { submitFeedbackCommand } from "./submit-feedback.command";
import { testRunCheckCommand } from "./test-run-check.command";
import { testRunDiffsCommand } from "./test-run-diffs.command";
import { testRunForCommitCommand } from "./test-run-for-commit.command";
import { timelineDiffCommand } from "./timeline.command";
import { triggerTestRunCommand } from "./trigger-test-run.command";
import { uploadBuildCommand } from "./upload-build.command";
import { rejectDiffCommand } from "./reject-diff.command";
import { ignoreDiffCommand } from "./ignore-diff.command";
import { createDiffCommentCommand } from "./create-diff-comment.command";
import { replyToDiffCommentCommand } from "./reply-to-diff-comment.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe:
    "Agent commands for retrieving data from and interacting with Meticulous.",
  builder: (yargs) =>
    yargs
      .command(testRunForCommitCommand)
      .command(testRunCheckCommand)
      .command(testRunDiffsCommand)
      .command(imageFilesCommand)
      .command(imageUrlsCommand)
      .command(domDiffCommand)
      .command(timelineDiffCommand)
      .command(diffCommentsCommand)
      .command(rejectDiffCommand)
      .command(ignoreDiffCommand)
      .command(createDiffCommentCommand)
      .command(replyToDiffCommentCommand)
      .command(jsCoverageCommand)
      .command(jsCoverageDiffCommand)
      .command(sessionsCommand)
      .command(uploadBuildCommand)
      .command(triggerTestRunCommand)
      .command(submitFeedbackCommand)
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
