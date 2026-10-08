import type { CommandModule } from "yargs";
import { completeBaseRunCommand } from "./complete-base-run.command";
import { promoteSessionsCommand } from "./promote-sessions.command";
import { diffCommentsCommand } from "./diff-comments.command";
import { jsCoverageDiffCommand } from "./js-coverage-diff.command";
import { jsCoverageCommand } from "./js-coverage.command";
import { domDiffCommand } from "./screenshot-dom-diff.command";
import { imageFilesCommand } from "./screenshot-image-files.command";
import { imageUrlsCommand } from "./screenshot-image.command";
import { sessionsCommand } from "./sessions.command";
import { agentSwarmRunCaseCommand } from "./agent-swarm-run-case.command";
import { agentSwarmRunCommand } from "./agent-swarm-run.command";
import { agentSwarmRunsCommand } from "./agent-swarm-runs.command";
import { testRunsCommand } from "./test-runs.command";
import { submitFeedbackCommand } from "./submit-feedback.command";
import { testRunCheckCommand } from "./test-run-check.command";
import { testRunDiffsCommand } from "./test-run-diffs.command";
import { testRunForCommitCommand } from "./test-run-for-commit.command";
import {
  projectDailyStatsCommand,
  testRunEventStatsCommand,
  testRunStatsCommand,
} from "./stats.command";
import { timelineDiffCommand } from "./timeline.command";
import { triggerTestRunCommand } from "./trigger-test-run.command";
import { uploadBuildCommand } from "./upload-build.command";
import { approveDiffCommand } from "./approve-diff.command";
import { rejectDiffCommand } from "./reject-diff.command";
import { ignoreDiffCommand } from "./ignore-diff.command";
import { createDiffCommentCommand } from "./create-diff-comment.command";
import { replyToDiffCommentCommand } from "./reply-to-diff-comment.command";
import { checkCommentsCommand } from "./check-comments.command";
import { approveCheckCommand } from "./approve-check.command";
import { rejectCheckCommand } from "./reject-check.command";
import { ignoreCheckCommand } from "./ignore-check.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe:
    "Agent commands for retrieving data from and interacting with Meticulous.",
  builder: (yargs) =>
    yargs
      .command(testRunForCommitCommand)
      .command(testRunCheckCommand)
      .command(checkCommentsCommand)
      .command(approveCheckCommand)
      .command(rejectCheckCommand)
      .command(ignoreCheckCommand)
      .command(testRunDiffsCommand)
      .command(imageFilesCommand)
      .command(imageUrlsCommand)
      .command(domDiffCommand)
      .command(timelineDiffCommand)
      .command(diffCommentsCommand)
      .command(approveDiffCommand)
      .command(rejectDiffCommand)
      .command(ignoreDiffCommand)
      .command(createDiffCommentCommand)
      .command(replyToDiffCommentCommand)
      .command(jsCoverageCommand)
      .command(jsCoverageDiffCommand)
      .command(sessionsCommand)
      .command(agentSwarmRunsCommand)
      .command(agentSwarmRunCommand)
      .command(agentSwarmRunCaseCommand)
      .command(testRunsCommand)
      .command(testRunStatsCommand)
      .command(projectDailyStatsCommand)
      .command(testRunEventStatsCommand)
      .command(uploadBuildCommand)
      .command(triggerTestRunCommand)
      .command(completeBaseRunCommand)
      .command(promoteSessionsCommand)
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
