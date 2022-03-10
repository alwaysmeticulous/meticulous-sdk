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
import { getCommitSha } from "../../utils/commit-sha.utils";

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
  // 1. Print project name
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    console.error(
      "Error: Could not retrieve project data. Is the API token correct?"
    );
    process.exit(1);
  }
  const projectName = `${project.organization.name}/${project.name}`;
  console.log(`Project: ${projectName}`);

  // 2. Guess commit SHA1
  const commitSha = await getCommitSha(commitSha_);
  if (!commitSha) {
    console.error("Error: Could not guess commit SHA1, aborting");
    process.exit(1);
  }
  console.log(`Commit: ${commitSha}`);

  // 3. Create zip archive of build artifacts
  console.log(`Uploading build artifacts from: ${dist}`);
  try {
    await checkDistFolder(dist);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${error}`);
    }
    process.exit(1);
  }
  const archivePath = await createArchive(dist);

  // 4. Get upload URL
  const projectBuild = await createProjectBuild(client, commitSha);
  const uploadUrlData = await getProjectBuildPushUrl(client, projectBuild.id);
  if (!uploadUrlData) {
    console.error("Error: Could not get a push URL from the Meticulous API");
    process.exit(1);
  }
  const uploadUrl = uploadUrlData.pushUrl;

  // 5. Send archive to S3
  try {
    await uploadArchive(uploadUrl, archivePath);
  } catch (error) {
    await putProjectBuildPushedStatus(client, projectBuild.id, "failure").catch(
      (updateError) => console.error(updateError)
    );
    console.error(error);
    process.exit(1);
  }

  // 6. Report successful upload to Meticulous
  const updatedProjectBuild = await putProjectBuildPushedStatus(
    client,
    projectBuild.id,
    "success"
  );
  console.log("Build artifacts successfully sent to Meticulous");
  console.log(updatedProjectBuild);

  await deleteArchive(archivePath);
};

export const uploadBuild: CommandModule<{}, Options> = {
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
  handler,
};
