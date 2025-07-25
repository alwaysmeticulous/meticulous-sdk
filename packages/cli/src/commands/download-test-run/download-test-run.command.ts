import { createClient } from "@alwaysmeticulous/client";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { getOrFetchTestRunData } from "@alwaysmeticulous/downloading-helpers";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  testRunId,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = createClient({ apiToken });

  const { fileName: testRunDir } = await getOrFetchTestRunData(
    client,
    testRunId,
    "everything"
  );
  logger.info(`Downloaded test run data to: ${testRunDir}`);
};

export const downloadTestRunCommand = buildCommand("download-test-run")
  .details({
    describe: "Download a Meticulous test run",
  })
  .options({
    apiToken: {
      string: true,
    },
    testRunId: {
      string: true,
      demandOption: true,
    },
  })
  .handler(handler);
