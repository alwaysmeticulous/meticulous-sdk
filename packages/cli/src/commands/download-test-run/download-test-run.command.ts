import { createClient } from "@alwaysmeticulous/client";
import { initLogger, IS_METICULOUS_SUPER_USER } from "@alwaysmeticulous/common";
import {
  TEST_RUN_DOWNLOAD_SCOPES,
  getOrFetchTestRunData,
  TestRunDownloadScope,
} from "@alwaysmeticulous/downloading-helpers";
import { buildCommand } from "../../command-utils/command-builder";

interface Options {
  apiToken?: string | null | undefined;
  testRunId?: string | null | undefined;
  scope?: string | null | undefined;
}

const ALLOWED_SCOPES: TestRunDownloadScope[] = ["coverage-only"];

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  testRunId,
  scope: _scope,
}) => {
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
      default: "latest",
    },
    scope: {
      string: true,
      demandOption: false,
      choices: [...TEST_RUN_DOWNLOAD_SCOPES],
      default: "coverage-only",
      hidden: !IS_METICULOUS_SUPER_USER,
    },
  })
  .handler(handler);
