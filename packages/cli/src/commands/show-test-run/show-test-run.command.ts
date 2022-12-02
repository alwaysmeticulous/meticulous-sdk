import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../../api/client";
import { getLatestTestRunResults } from "../../api/test-run.api";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";

interface ShowTestRunCommandOptions {
  apiToken?: string | undefined;
  commitSha: string;
}

const handler = async ({
  apiToken,
  commitSha,
}: ShowTestRunCommandOptions): Promise<void> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  const testRun = await getLatestTestRunResults({
    client,
    commitSha,
  });

  if (testRun == null) {
    logger.info(`No test run for commit ${commitSha}`);
    return;
  }

  const toPrint = {
    id: testRun.id,
    status: testRun.status,
  };
  logger.info("Test run found:");
  logger.info(JSON.stringify(toPrint, null, 2));
};

export const showTestRunCommand = buildCommand("show-test-run")
  .details({ describe: "Get the latest test run for a given commit" })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: { ...OPTIONS.commitSha, demandOption: true },
  } as const)
  .handler(handler);
