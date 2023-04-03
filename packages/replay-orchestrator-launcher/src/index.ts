import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import {
  ExecuteTestRunOptions,
  ExecuteTestRunResult,
  ReplayAndStoreResultsOptions,
  ReplayExecution,
} from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";

export const replayAndStoreResults = async (
  options: Omit<ReplayAndStoreResultsOptions, "logLevel">
): Promise<ReplayExecution> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation = await fetchAsset(
    "replay/v3/replay-and-store-results.bundle.js"
  );
  return (await require(bundleLocation)).replayAndStoreResults({
    ...options,
    logLevel: logger.getLevel(),
  });
};

export const executeTestRun = async (
  options: Omit<ExecuteTestRunOptions, "logLevel">
): Promise<ExecuteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation = await fetchAsset(
    "replay/v3/execute-test-run.bundle.js"
  );
  return (await require(bundleLocation)).executeTestRun({
    ...options,
    logLevel: logger.getLevel(),
  });
};
