import { ensureBrowser, initLogger } from "@alwaysmeticulous/common";
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

export const replayAndStoreResults = async (
  options: Omit<
    ReplayAndStoreResultsOptions,
    "logLevel" | "chromeExecutablePath" | "projectId"
  >,
): Promise<ReplayExecution> => {
  const logger = initLogger();
  const bundleLocation = await fetchAsset(
    "replay/v3/replay-and-store-results.bundle.js",
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).replayAndStoreResults({
    ...options,
    chromeExecutablePath: await ensureBrowser(),
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
  const logger = initLogger();
  const bundleLocation =
    options.executeScheduledTestRunBundlePath ??
    (await fetchAsset(EXECUTE_SCHEDULED_TEST_RUN_BUNDLE_PATH));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).executeTestRunV2({
    ...options,
    chromeExecutablePath: await ensureBrowser(),
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
  const logger = initLogger();
  const bundleLocation =
    options.executeScheduledTestRunBundlePath ??
    (await fetchAsset(EXECUTE_SCHEDULED_TEST_RUN_BUNDLE_PATH));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).executeTestRunChunk({
    ...options,
    chromeExecutablePath: await ensureBrowser(),
    logLevel: logger.getLevel(),
  });
};

export const executeTestRun = async (
  options: Omit<ExecuteTestRunOptions, "logLevel" | "chromeExecutablePath">,
): Promise<ExecuteTestRunResult> => {
  const logger = initLogger();
  const bundleLocation = await fetchAsset(
    "replay/v3/execute-test-run.bundle.js",
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).executeTestRun({
    ...options,
    chromeExecutablePath: await ensureBrowser(),
    logLevel: logger.getLevel(),
  });
};
