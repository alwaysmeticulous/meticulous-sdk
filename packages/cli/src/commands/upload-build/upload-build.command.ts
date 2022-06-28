import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import {
  createProjectBuild,
  getProjectBuildPushUrl,
  putProjectBuildPushedStatus,
} from "../../api/project-build.api";
import { getProject } from "../../api/project.api";
import { uploadArchive } from "../../api/upload";
import {
  checkDistFolder,
  createArchive,
  deleteArchive,
} from "../../archive/archive";
import log from "loglevel";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { wrapHandler } from "../../utils/sentry.utils";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";

interface Options {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  dist: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  dist,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  // 1. Print project name
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    logger.error(
      "Error: Could not retrieve project data. Is the API token correct?"
    );
    process.exit(1);
  }
  const projectName = `${project.organization.name}/${project.name}`;
  logger.info(`Project: ${projectName}`);

  // 2. Guess commit SHA1
  const commitSha = await getCommitSha(commitSha_);
  if (!commitSha) {
    logger.error("Error: Could not guess commit SHA1, aborting");
    process.exit(1);
  }
  logger.info(`Commit: ${commitSha}`);

  // 3. Create zip archive of build artifacts
  logger.info(`Uploading build artifacts from: ${dist}`);
  try {
    await checkDistFolder(dist);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
    } else {
      logger.error(`Error: ${error}`);
    }
    process.exit(1);
  }
  const archivePath = await createArchive(dist);

  // 4. Get upload URL
  const projectBuild = await createProjectBuild(client, commitSha);
  const uploadUrlData = await getProjectBuildPushUrl(client, projectBuild.id);
  if (!uploadUrlData) {
    logger.error("Error: Could not get a push URL from the Meticulous API");
    process.exit(1);
  }
  const uploadUrl = uploadUrlData.pushUrl;

  // 5. Send archive to S3
  try {
    await uploadArchive(uploadUrl, archivePath);
  } catch (error) {
    await putProjectBuildPushedStatus(client, projectBuild.id, "failure").catch(
      (updateError) => logger.error(updateError)
    );
    logger.error(error);
    process.exit(1);
  }

  // 6. Report successful upload to Meticulous
  const updatedProjectBuild = await putProjectBuildPushedStatus(
    client,
    projectBuild.id,
    "success"
  );
  logger.info("Build artifacts successfully sent to Meticulous");
  logger.debug(updatedProjectBuild);

  await deleteArchive(archivePath);
};

export const uploadBuild: CommandModule<unknown, Options> = {
  command: "upload-build",
  describe: "Upload build artifacts to Meticulous",
  builder: {
    apiToken: {
      string: true,
    },
    commitSha: {
      string: true,
    },
    dist: {
      string: true,
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
