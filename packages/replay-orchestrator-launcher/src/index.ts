import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import {
  ExecuteScheduledTestRunChunkOptions,
  ExecuteScheduledTestRunOptions,
  ExecuteTestRunOptions,
  ExecuteTestRunResult,
  InProgressTestRun,
  InProgressTestRunChunk,
  ReplayAndStoreResultsOptions,
  ReplayExecution,
} from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { executablePath } from "puppeteer";

export const replayAndStoreResults = async (
  options: Omit<
    ReplayAndStoreResultsOptions,
    "logLevel" | "chromeExecutablePath" | "projectId"
  >,
): Promise<ReplayExecution> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation = await fetchAsset(
    "replay/v3/replay-and-store-results.bundle.js",
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).replayAndStoreResults({
    ...options,
    chromeExecutablePath: getChromiumExecutablePath(),
    logLevel: logger.getLevel(),
  });
};

const EXECUTE_SCHEDULED_TEST_RUN_BUNDLE_PATH =
  "replay/v3/execute-scheduled-test-run.bundle.js";

/**
 * @deprecated This function is deprecated and will be removed in future versions.
 */
export const executeScheduledTestRun = async (
  options: Omit<
    ExecuteScheduledTestRunOptions,
    "logLevel" | "chromeExecutablePath"
  > & {
    executeScheduledTestRunBundlePath?: string;
  },
): Promise<InProgressTestRun> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation =
    options.executeScheduledTestRunBundlePath ??
    (await fetchAsset(EXECUTE_SCHEDULED_TEST_RUN_BUNDLE_PATH));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).executeTestRunV2({
    ...options,
    chromeExecutablePath: getChromiumExecutablePath(),
    logLevel: logger.getLevel(),
  });
};

/**
 * @deprecated This function is deprecated and will be removed in future versions.
 */
export const executeScheduledTestRunChunk = async (
  options: Omit<
    ExecuteScheduledTestRunChunkOptions,
    "logLevel" | "chromeExecutablePath"
  > & {
    executeScheduledTestRunBundlePath?: string;
  },
): Promise<InProgressTestRunChunk> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation =
    options.executeScheduledTestRunBundlePath ??
    (await fetchAsset(EXECUTE_SCHEDULED_TEST_RUN_BUNDLE_PATH));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).executeTestRunChunk({
    ...options,
    chromeExecutablePath: getChromiumExecutablePath(),
    logLevel: logger.getLevel(),
  });
};

export const executeTestRun = async (
  options: Omit<ExecuteTestRunOptions, "logLevel" | "chromeExecutablePath">,
): Promise<ExecuteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation = await fetchAsset(
    "replay/v3/execute-test-run.bundle.js",
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).executeTestRun({
    ...options,
    chromeExecutablePath: getChromiumExecutablePath(),
    logLevel: logger.getLevel(),
  });
};

const getChromiumExecutablePath = () => {
  // replay-orchestrator-launcher has a puppeteer dependency, which ensures
  // that Chromium gets downloaded at the Yarn/NPM pre-install stage. We need to pass
  // the reference to this specific version of Chromium to the replay bundle, since
  // the replay bundle may use a slightly different version of Puppeteer, which
  // may have a slightly different default Chromium path/version.
  return executablePath();
};
