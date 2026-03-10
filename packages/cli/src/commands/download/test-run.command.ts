import { createClient } from "@alwaysmeticulous/client";
import { initLogger, IS_METICULOUS_SUPER_USER } from "@alwaysmeticulous/common";
import {
  getOrFetchTestRunData,
  TEST_RUN_DOWNLOAD_SCOPES,
  TestRunDownloadScope,
} from "@alwaysmeticulous/downloading-helpers";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  testRunId?: string | null | undefined;
  scope?: string | null | undefined;
}

const ALLOWED_SCOPES: TestRunDownloadScope[] = [
  "coverage-only",
  "app-container-logs",
];

const handler = async ({
  apiToken,
  testRunId,
  scope: _scope,
}: Options): Promise<void> => {
  const logger = initLogger();
  const client = createClient({ apiToken });

  const scope = (_scope as TestRunDownloadScope) ?? "coverage-only";

  if (!ALLOWED_SCOPES.includes(scope)) {
    if (!IS_METICULOUS_SUPER_USER) {
      logger.error(`Invalid scope: ${scope}`);
      process.exit(1);
    }
    logger.warn(
      `Downloading admin-only scope (files downloaded are subject to change with no warning)`,
    );
  }

  const { fileName: testRunDir } = await getOrFetchTestRunData(
    client,
    testRunId ?? "latest",
    scope,
  );
  logger.info(`Downloaded test run data to: ${testRunDir}`);
};

export const downloadTestRunCommand: CommandModule<unknown, Options> = {
  command: "test-run",
  describe: "Download a Meticulous test run",
  builder: {
    apiToken: {
      string: true,
    },
    testRunId: {
      string: true,
      default: "latest",
    },
    scope: {
      string: true,
      demandOption: false,
      choices: [...TEST_RUN_DOWNLOAD_SCOPES],
      default: "coverage-only",
      hidden: !IS_METICULOUS_SUPER_USER,
    },
  },
  handler: wrapHandler(handler),
};
