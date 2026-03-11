import {
  createClient,
  getProject,
  getRelevantSessions,
} from "@alwaysmeticulous/client";
import { getLocalBaseSha, initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  getGitDiff,
  parseGitDiffToEditedFiles,
} from "./get-edited-files.utils";

interface Options {
  apiToken?: string | null | undefined;
}

const handler = async ({ apiToken }: Options) => {
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

  const gitDiff = await getGitDiff(baseCommitSha);

  const editedFilesWithLines = parseGitDiffToEditedFiles(gitDiff);

  logger.info(JSON.stringify(editedFilesWithLines, null, 2));

  const relevantSessions = await getRelevantSessions(client, {
    projectId: project.id,
    baseCommitSha,
    editedFilesWithLines,
  });
};

export const relevantSessionsCommand: CommandModule<unknown, Options> = {
  command: "relevant-sessions",
  describe: "Get relevant sessions for the local branch",
  builder: {
    apiToken: OPTIONS.apiToken,
  },
  handler: wrapHandler(handler),
};
