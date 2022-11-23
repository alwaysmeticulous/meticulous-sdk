import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../../api/client";
import { getTestRun } from "../../api/test-run.api";
import { buildCommand } from "../../command-utils/command-builder";
import { readConfig, saveConfig } from "../../config/config";
import { MeticulousCliConfig, TestCaseResult } from "../../config/config.types";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string;
  accept?: string[] | null | undefined;
  acceptAll?: boolean | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  testRunId,
  accept: accept_,
  acceptAll: acceptAll_,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  const config = await readConfig();
  const testCases = config.testCases || [];

  if (!testCases.length) {
    logger.error("Error! No test case defined");
    process.exit(1);
  }

  const testRun = await getTestRun({ client, testRunId });
  if (!testRun) {
    logger.error(
      "Error: Could not retrieve test run. Is the API token correct?"
    );
    process.exit(1);
  }

  if (testRun.status === "Success") {
    logger.info("Test run successful, no tests to updates");
    return;
  }

  if (testRun.status === "Running") {
    logger.error("Error: Tests are still running");
    process.exit(1);
  }

  const testRunResults = testRun.resultData?.results || [];

  const accept = accept_ || [];
  const acceptAll = acceptAll_ || false;
  if (!acceptAll && !accept.length) {
    throw new Error("One of --accept or --acceptAll needs to be specified.");
  }

  const testRunResultsBySessionId = new Map<string, TestCaseResult>();
  testRunResults.forEach((result) => {
    testRunResultsBySessionId.set(result.sessionId, result);
  });

  const newTestCases = testCases.map((testCase) => {
    const { sessionId } = testCase;
    const matched = testRunResultsBySessionId.get(sessionId);
    if (!matched) {
      logger.warn(`WARNING: ${sessionId} not found in test run`);
      return testCase;
    }

    if (
      matched.result === "pass" ||
      (!acceptAll &&
        !accept.find((replayId) => replayId === matched.headReplayId))
    ) {
      return testCase;
    }

    const headReplayId = matched.headReplayId || "";
    if (!headReplayId) {
      logger.warn(`WARNING: ${sessionId} has no new replay id`);
      return testCase;
    }

    const newTestCase = { ...testCase, baseReplayId: headReplayId };
    return newTestCase;
  });

  const newConfig: MeticulousCliConfig = {
    ...config,
    testCases: newTestCases,
  };
  await saveConfig(newConfig);
};

export const updateTestsCommand = buildCommand("update-tests")
  .details({
    describe: "Updates test cases",
  })
  .options({
    apiToken: {
      string: true,
    },
    testRunId: {
      string: true,
      demandOption: true,
      description: "Test run id to fix",
    },
    accept: {
      string: true,
      array: true,
      description: "Replay ids to accept as valid",
    },
    acceptAll: {
      boolean: true,
      description: "Accept all failing tests as valid",
      conflicts: "accept",
    },
  })
  .handler(handler);
