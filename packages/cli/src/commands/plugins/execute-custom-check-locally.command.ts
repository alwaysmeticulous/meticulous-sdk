import {
  CUSTOM_CHECK_SUMMARY_MAX_LENGTH,
  type CustomCheckOutput,
} from "@alwaysmeticulous/api";
import {
  createClientWithOAuth,
  getSnapshotsFromTestRun,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import chalk from "chalk";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { loadCustomCheckPlugin } from "./load-custom-check-plugin";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string;
  pluginPath: string;
}

const handler = async ({
  apiToken,
  testRunId,
  pluginPath,
}: Options): Promise<void> => {
  const logger = initLogger();

  const { manifest, check } = await loadCustomCheckPlugin(pluginPath);
  logger.info(
    `Loaded custom check "${manifest.configuration.displayName}" (id: ${manifest.id}, v${manifest.version})`,
  );

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const snapshotTypes = manifest.configuration.handlesSnapshotTypes;
  logger.info(
    `Fetching custom check snapshots for test run ${testRunId} (types: ${snapshotTypes.join(
      ", ",
    )})\u2026 this can take a little while.`,
  );
  const fetchStartedAt = Date.now();
  const { baseTestRunId, baseSnapshots, headSnapshots } =
    await getSnapshotsFromTestRun({
      client,
      testRunId,
      snapshotTypes,
    });
  logger.info(
    `Fetched snapshots in ${((Date.now() - fetchStartedAt) / 1000).toFixed(
      1,
    )}s for test run ${testRunId} (compared against base test run ${baseTestRunId}): ${baseSnapshots.length} base, ${headSnapshots.length} head.`,
  );

  const output = await check.execute({ baseSnapshots, headSnapshots });

  printResult(manifest.configuration.displayName, output, logger);

  // Exit non-zero when the check did not pass cleanly so the command is usable
  // as a gate while iterating on a plugin locally.
  if (output.verdict === "fail" || output.verdict === "execution-error") {
    process.exit(1);
  }
};

const printResult = (
  displayName: string,
  output: CustomCheckOutput,
  logger: ReturnType<typeof initLogger>,
): void => {
  const verdictLabel = {
    pass: chalk.green("pass"),
    warn: chalk.yellow("warn"),
    fail: chalk.red("fail"),
    "execution-error": chalk.red("execution-error"),
  }[output.verdict];

  logger.info("");
  logger.info(
    `${chalk.bold(displayName)}: ${verdictLabel}${
      output.summary ? ` — ${truncateSummary(output.summary)}` : ""
    }`,
  );

  if (output.report.type === "markdown" && output.report.markdown.trim()) {
    logger.info("");
    logger.info(output.report.markdown);
  }
};

// Mirror the UI's inline-summary limit so authors see locally when a summary is
// too long to render inline.
const truncateSummary = (summary: string): string =>
  summary.length > CUSTOM_CHECK_SUMMARY_MAX_LENGTH
    ? `${summary.slice(0, CUSTOM_CHECK_SUMMARY_MAX_LENGTH - 1)}…`
    : summary;

export const executeCustomCheckLocallyCommand: CommandModule<unknown, Options> =
  {
    command: "execute-custom-check-locally",
    describe:
      "Run a custom check plugin locally against the snapshots of a test run",
    builder: {
      apiToken: {
        string: true,
      },
      testRunId: {
        string: true,
        demandOption: true,
        description: "The test run to run the custom check against",
      },
      pluginPath: {
        string: true,
        demandOption: true,
        description:
          "Path to the built plugin directory (containing manifest.json and its entry point)",
      },
    },
    handler: wrapHandler(handler),
  };
