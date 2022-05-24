import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { getProject } from "../../api/project.api";
import { wrapHandler } from "../../utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({ apiToken }) => {
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    console.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }
  console.log(project);
};

export const showProject: CommandModule<unknown, Options> = {
  command: "show-project",
  describe: "Shows project linked with current API token",
  builder: {
    apiToken: {
      string: true,
    },
  },
  handler: wrapHandler(handler),
};
