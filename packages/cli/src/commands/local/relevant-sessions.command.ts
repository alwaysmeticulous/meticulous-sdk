import {
  createClient,
  getProject,
  getRelevantSessions,
} from "@alwaysmeticulous/client";
import { getLocalBaseSha, initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";

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
  /**
   *   Steps:
   *   1. Get the base commit SHA as the merge base of the current branch and the main branch (determined as the HEAD of the remote origin)
   *   2. Get the edited files with lines: we'll need to move or copy the util from the main repo to convert to the format expected by the client
   *   3. Get the relevant sessions
   */
  const relevantSessions = await getRelevantSessions(client, {
    projectId: project.id,
    baseCommitSha,
    editedFilesWithLines: [],
  });
  logger.info(relevantSessions);
};

export const relevantSessionsCommand: CommandModule<unknown, Options> = {
  command: "relevant-sessions",
  describe: "Get relevant sessions for the local branch",
  builder: {
    apiToken: OPTIONS.apiToken,
  },
  handler: wrapHandler(handler),
};
