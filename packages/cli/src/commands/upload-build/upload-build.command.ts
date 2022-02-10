import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import {
  createProjectBuild,
  getProjectBuild,
  getProjectBuildPushUrl,
  putProjectBuildPushedStatus,
  uploadProjectBuildArchive,
} from "../../api/project-build.api";
import {
  checkDistFolder,
  createArchive,
  deleteArchive,
} from "../../archive/archive";

interface Options {
  apiToken?: string | null | undefined;
  commitSha: string;
  dist: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha,
  dist,
}) => {
  // 1. Create zip archive of build artifacts
  try {
    await checkDistFolder(dist);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
  const archivePath = await createArchive(dist);

  // 2. Get upload URL
  const client = createClient({ apiToken });
  const projectBuild = await createProjectBuild(client, commitSha);
  const uploadUrlData = await getProjectBuildPushUrl(client, projectBuild.id);
  if (!uploadUrlData) {
    console.error("Could not get a push URL from the Meticulous API");
    process.exit(1);
  }
  const uploadUrl = uploadUrlData.pushUrl;

  // 3. Send archive to S3
  try {
    await uploadProjectBuildArchive(uploadUrl, archivePath);
  } catch (error) {
    await putProjectBuildPushedStatus(client, projectBuild.id, "failure").catch(
      (updateError) => console.error(updateError)
    );
    console.error(error);
    process.exit(1);
  }

  // 4. Report successful upload to Meticulous
  const updatedProjectBuild = await putProjectBuildPushedStatus(
    client,
    projectBuild.id,
    "success"
  );
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
      demandOption: true,
    },
    dist: {
      string: true,
      demandOption: true,
    },
  },
  handler,
};
