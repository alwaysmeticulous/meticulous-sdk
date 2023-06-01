import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import {
  ExecuteScheduledTestRunOptions,
  ExecuteTestRunOptions,
  ExecuteTestRunResult,
  ReplayAndStoreResultsOptions,
  ReplayExecution,
} from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { executablePath } from "puppeteer";

export const ENVIRONMENT_VERSION = 1;

export const replayAndStoreResults = async (
  options: Omit<
    ReplayAndStoreResultsOptions,
    "logLevel" | "chromeExecutablePath" | "logicalEnvironmentVersion"
  >
): Promise<ReplayExecution> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation = await fetchAsset(
    "replay/v3/replay-and-store-results.bundle.js"
  );

  return (await require(bundleLocation)).replayAndStoreResults({
    ...options,
    chromeExecutablePath: getChromiumExecutablePath(),
    logLevel: logger.getLevel(),
    logicalEnvironmentVersion: ENVIRONMENT_VERSION,
  });
};

export const executeScheduledTestRun = async (
  options: Omit<
    ExecuteScheduledTestRunOptions,
    "logLevel" | "chromeExecutablePath" | "logicalEnvironmentVersion"
  >
): Promise<ExecuteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation = await fetchAsset(
    "replay/v3/execute-scheduled-test-run.bundle.js"
  );

  return (await require(bundleLocation)).executeTestRun({
    ...options,
    chromeExecutablePath: getChromiumExecutablePath(),
    logLevel: logger.getLevel(),
    logicalEnvironmentVersion: ENVIRONMENT_VERSION,
  });
};

export const executeTestRun = async (
  options: Omit<
    ExecuteTestRunOptions,
    "logLevel" | "chromeExecutablePath" | "logicalEnvironmentVersion"
  >
): Promise<ExecuteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const bundleLocation = await fetchAsset(
    "replay/v3/execute-test-run.bundle.js"
  );

  return (await require(bundleLocation)).executeTestRun({
    ...options,
    chromeExecutablePath: getChromiumExecutablePath(),
    logLevel: logger.getLevel(),
    logicalEnvironmentVersion: ENVIRONMENT_VERSION,
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
