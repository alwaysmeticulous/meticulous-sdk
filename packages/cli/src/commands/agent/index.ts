import { routeLogsToStderr } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { RESULT_ONLY_LOG_OPTIONS } from "../../command-utils/log-level-options";
import { AGENT_COMMAND_EPILOG } from "./agent-help";
import { completeBaseRunCommand } from "./complete-base-run.command";
import { promoteSessionsCommand } from "./promote-sessions.command";
import { diffCommentsCommand } from "./diff-comments.command";
import { jsCoverageDiffCommand } from "./js-coverage-diff.command";
import { jsCoverageCommand } from "./js-coverage.command";
import { domDiffCommand } from "./screenshot-dom-diff.command";
import { screenshotDomCommand } from "./screenshot-dom.command";
import { imageFilesCommand } from "./screenshot-image-files.command";
import { imageUrlsCommand } from "./screenshot-image.command";
import { sessionsCommand } from "./sessions.command";
import { agentSwarmRunCaseCommand } from "./agent-swarm-run-case.command";
import { agentSwarmRunCommand } from "./agent-swarm-run.command";
import { agentSwarmRunsCommand } from "./agent-swarm-runs.command";
import { agentSwarmSetupBlockersCommand } from "./agent-swarm-setup-blockers.command";
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
import { timelineDiffCommand } from "./timeline-diff.command";
import { timelineCommand } from "./timeline.command";
import { timelineEventCommand } from "./timeline-event.command";
import { timelineEventDiffCommand } from "./timeline-event-diff.command";
import { triggerTestRunCommand } from "./trigger-test-run.command";
import { uploadBuildCommand } from "./upload-build.command";
import { approveDiffCommand } from "./approve-diff.command";
import { rejectDiffCommand } from "./reject-diff.command";
import { ignoreDiffCommand } from "./ignore-diff.command";
import { createDiffCommentCommand } from "./create-diff-comment.command";
import { replyToDiffCommentCommand } from "./reply-to-diff-comment.command";
import { checkCommentsCommand } from "./check-comments.command";
import { ignoreCheckCommand } from "./ignore-check.command";

export const agentCommand: CommandModule = {
  command: "agent",
  describe:
    "For AI agents: review Meticulous test runs, visual diffs and checks, and act on them. See `meticulous agent --help` for when and how.",
  builder: (yargs) =>
    yargs
      .command(testRunForCommitCommand)
      .command(testRunCheckCommand)
      .command(checkCommentsCommand)
      .command(ignoreCheckCommand)
      .command(testRunDiffsCommand)
      .command(imageFilesCommand)
      .command(imageUrlsCommand)
      .command(screenshotDomCommand)
      .command(domDiffCommand)
      .command(timelineCommand)
      .command(timelineDiffCommand)
      .command(timelineEventCommand)
      .command(timelineEventDiffCommand)
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
      .command(agentSwarmSetupBlockersCommand)
      .command(testRunsCommand)
      .command(testRunStatsCommand)
      .command(projectDailyStatsCommand)
      .command(testRunEventStatsCommand)
      .command(uploadBuildCommand)
      .command(triggerTestRunCommand)
      .command(completeBaseRunCommand)
      .command(promoteSessionsCommand)
      .command(submitFeedbackCommand)
      .options(RESULT_ONLY_LOG_OPTIONS)
      .middleware(routeLogsToStderr)
      .option("json", {
        boolean: true,
        default: false,
        description:
          "Output the result as JSON. Only stdout is affected — progress and " +
          "notices still go to stderr — and stdout is always valid JSON, " +
          "including an empty array/object when there is no result.",
      })
      .epilog(AGENT_COMMAND_EPILOG)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
