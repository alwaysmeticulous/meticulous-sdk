import { SessionRelevance } from "@alwaysmeticulous/api";
import {
  createClient,
  getProject,
  getRelevantSessions,
  RelevantSession,
} from "@alwaysmeticulous/client";
import { getLocalBaseSha, initLogger } from "@alwaysmeticulous/common";
import { writeManifest } from "@alwaysmeticulous/downloading-helpers";
import chalk from "chalk";
import { CommandModule } from "yargs";
import {
  DEFAULT_SESSION_OUTPUT_DIR,
  OPTIONS,
} from "../../command-utils/common-options";
import { downloadSingleSession } from "../../command-utils/download-session.utils";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  getGitDiff,
  parseGitDiffToEditedFiles,
} from "./get-edited-files.utils";

interface Options {
  apiToken?: string | null | undefined;
  showMaybeRelevant?: boolean;
  startingPointSha?: string | null | undefined;
  minimumTimesToCoverEachLine?: number;
  includeSuperfluousSessions: boolean;
  format?: "multi-file";
  outputDir: string;
}

const handler = async ({
  apiToken,
  showMaybeRelevant,
  startingPointSha,
  minimumTimesToCoverEachLine,
  includeSuperfluousSessions,
  format,
  outputDir,
}: Options) => {
  const logger = initLogger();
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
    ...(minimumTimesToCoverEachLine !== undefined
      ? { minimumTimesToCoverEachLine }
      : {}),
    loadSuperfluousTestCases: includeSuperfluousSessions,
  });

  if (response.error) {
    logger.error(`${chalk.red("Error:")} ${response.error}`);
  }

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

  if (mainSessions.length === 0) {
    logger.info(chalk.dim("No relevant sessions found for the current changes."));
  } else {
    logger.info(chalk.bold(`Found ${mainSessions.length} relevant sessions:`));
    mainSessions.forEach((session) => {
      logger.info(formatSession(session));
      logger.info("");
    });
  }

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

  if (format === "multi-file") {
    const sessionsToDownload = mainSessions;
    if (sessionsToDownload.length === 0) {
      logger.info(chalk.dim("No sessions to download."));
      return;
    }

    logger.info(
      `Downloading session data for ${sessionsToDownload.length} sessions to ${outputDir}...`,
    );

    const summaries = await downloadAllSessionData({
      client,
      sessions: sessionsToDownload,
      outputDir,
      logger,
    });

    await writeManifest(outputDir, summaries);

    logger.info(
      chalk.green(
        `Session data written to ${outputDir}/ (${summaries.length} sessions)`,
      ),
    );
  }
};

const downloadAllSessionData = async ({
  client,
  sessions,
  outputDir,
  logger,
}: {
  client: ReturnType<typeof createClient>;
  sessions: RelevantSession[];
  outputDir: string;
  logger: ReturnType<typeof initLogger>;
}) => {
  const results = await Promise.all(
    sessions.map((session) =>
      downloadSingleSession(client, session.sessionId, outputDir, logger),
    ),
  );

  return results.filter(
    (s): s is NonNullable<typeof s> => s != null,
  );
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
    "minimum-times-to-cover-each-line": {
      alias: "minimumTimesToCoverEachLine",
      type: "number",
      description:
        "Select at least this many sessions to cover each edited line, choosing the most diverse subset of candidate sessions when more sessions than required are available.",
    },
    "include-superfluous-sessions": {
      alias: "includeSuperfluousSessions",
      type: "boolean",
      description:
        "Includes additional sessions that do test some of your local changes but were superfluous -- other sessions already cover your code sufficiently, considering the value passed for `minimum-times-to-cover-each-line`",
      default: false,
    },
    format: {
      choices: ["multi-file"] as const,
      description:
        'Set to "multi-file" to download each relevant session\'s data as a structured directory tree',
    },
    outputDir: {
      type: "string",
      description: "Output directory for multi-file format",
      default: DEFAULT_SESSION_OUTPUT_DIR,
    },
  },
  handler: wrapHandler(handler),
};
