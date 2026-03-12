import { SessionRelevance } from "@alwaysmeticulous/api";
import {
  createClient,
  getProject,
  getRelevantSessions,
  RelevantSession,
} from "@alwaysmeticulous/client";
import { getLocalBaseSha, initLogger } from "@alwaysmeticulous/common";
import chalk from "chalk";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  getGitDiff,
  parseGitDiffToEditedFiles,
} from "./get-edited-files.utils";

interface Options {
  apiToken?: string | null | undefined;
  showMaybeRelevant?: boolean;
  startingPointSha?: string | null | undefined;
}

const handler = async ({
  apiToken,
  showMaybeRelevant,
  startingPointSha,
}: Options) => {
  const logger = initLogger();
  // TODO: support OAuth
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const baseCommitSha = await getLocalBaseSha();

  if (!baseCommitSha) {
    logger.error(
      "Could not determine the base commit SHA. Is the repository a git repository?",
    );
    process.exit(1);
  }

  const diffFromSha = startingPointSha ?? baseCommitSha;
  const gitDiff = await getGitDiff(diffFromSha);

  const editedFilesWithLines = parseGitDiffToEditedFiles(gitDiff);

  const response = await getRelevantSessions(client, {
    projectId: project.id,
    baseCommitSha,
    editedFilesWithLines,
  });

  if (response.baseTestRunId) {
    logger.info(`${chalk.cyan("Base test run ID:")} ${response.baseTestRunId}`);
  }
  if (response.baseTestRunUrl) {
    logger.info(
      `${chalk.cyan("Base test run URL:")} ${response.baseTestRunUrl}`,
    );
  }
  if (response.baseTestRunId || response.baseTestRunUrl) {
    logger.info("");
  }

  const mainSessions = response.testCases.filter(isMainRelevant);
  const maybeSessions = response.testCases.filter((s) => !isMainRelevant(s));

  logger.info(chalk.bold(`Found ${mainSessions.length} relevant sessions:`));
  mainSessions.forEach((session) => {
    logger.info(formatSession(session));
    logger.info("");
  });

  if (maybeSessions.length > 0) {
    if (showMaybeRelevant) {
      logger.info(
        chalk.bold(
          `Also found ${maybeSessions.length} maybe relevant sessions:`,
        ),
      );
      maybeSessions.forEach((session) => {
        logger.info(formatSession(session));
        logger.info("");
      });
    } else {
      logger.info(
        chalk.dim(
          `Also found ${maybeSessions.length} maybe relevant sessions. Run command with --showMaybeRelevant to show these.`,
        ),
      );
    }
  }
};

const isMainRelevant = (session: RelevantSession): boolean => {
  const { relevanceToPR } = session;
  return (
    relevanceToPR === SessionRelevance.IsRelevant ||
    relevanceToPR === SessionRelevance.IsRelevantBeta ||
    relevanceToPR === SessionRelevance.IsPrAuthorRelevant
  );
};

const formatSession = (session: RelevantSession): string => {
  const parts: string[] = [
    `  ${chalk.cyan("Session ID:")} ${session.sessionId}`,
  ];
  if (session.title) {
    parts.push(`  ${chalk.cyan("Title:")} ${session.title}`);
  }
  if (session.description) {
    parts.push(`  ${chalk.cyan("Description:")} ${session.description}`);
  }
  if (session.baseReplayId) {
    parts.push(`  ${chalk.cyan("Base replay ID:")} ${session.baseReplayId}`);
  }
  if (session.relevanceToPR) {
    parts.push(
      `  ${chalk.cyan("Relevance:")} ${chalk.green(session.relevanceToPR)}`,
    );
  }
  return parts.join("\n");
};

export const relevantSessionsCommand: CommandModule<unknown, Options> = {
  command: "relevant-sessions",
  describe: "Get relevant sessions for the local branch",
  builder: {
    apiToken: OPTIONS.apiToken,
    showMaybeRelevant: {
      type: "boolean",
      description: "Also show maybe-relevant sessions",
      default: false,
    },
    startingPointSha: {
      type: "string",
      description:
        "Only consider changes since this commit SHA. The merge-base is still used to find the base test run, but the diff is computed from this SHA instead. Useful in agentic workflows to avoid re-running tests for already-verified changes.",
    },
  },
  handler: wrapHandler(handler),
};
