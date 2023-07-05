import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { ReplayExecutionOptions } from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { createClient } from "../client";
import { getProject } from "./project.api";

export const applyDefaultExecutionOptionsFromProject = async ({
  apiToken,
  executionOptions,
}: {
  apiToken: string | undefined | null;
  executionOptions: ReplayExecutionOptions;
}): Promise<ReplayExecutionOptions> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    throw new Error(
      `Could not retrieve project data. Is the API token correct?`
    );
  }

  if (
    executionOptions.networkStubbingMode != null ||
    project.settings.networkStubbingMode == null
  ) {
    return executionOptions;
  }

  if (project.settings.networkStubbingMode.type === "stub-non-ssr-requests") {
    logger.info("");
    logger.info(
      "Stubbing all requests, except requests to render server components and requests for static assets"
    );
    logger.info("Visit your project settings page if you wish to change this");
    logger.info("");
  }
  if (project.settings.networkStubbingMode.type === "custom-stubbing") {
    logger.info("");
    logger.info(
      `Stubbing all requests, except requests which match one of the following regexes: [${project.settings.networkStubbingMode.requestsToNotStub
        .map((request) => `'${request.urlRegex}'`)
        .join(", ")}]`
    );
    logger.info("Visit your project settings page if you wish to change this");
    logger.info("");
  }

  return {
    ...executionOptions,
    networkStubbingMode: project.settings.networkStubbingMode,
  };
};
