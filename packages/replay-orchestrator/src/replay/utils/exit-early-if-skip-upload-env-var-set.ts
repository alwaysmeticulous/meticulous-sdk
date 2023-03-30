import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { ScreenshotComparisonOptions } from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";

const METICULOUS_SKIP_UPLOAD_ENV_VAR = "METICULOUS_SKIP_UPLOAD";

// Uploading the zip can take a long time, so we expose a env variable to support skipping it
// We don't expose this as a first-class CLI option because we don't want to pollute the list of CLI options
export const exitEarlyIfSkipUploadEnvVarSet = (
  screenshottingOptions: ScreenshotComparisonOptions
) => {
  if (!shouldSkipUpload()) {
    return;
  }

  if (
    screenshottingOptions.enabled &&
    screenshottingOptions.compareTo.type !== "do-not-compare"
  ) {
    throw new Error(
      `Cannot compare to base results when ${METICULOUS_SKIP_UPLOAD_ENV_VAR} is set to true. ${METICULOUS_SKIP_UPLOAD_ENV_VAR}
      cannot be used when specifying anything to compare to (a --baseTestRunId, or --baseReplayId etc.)
      `
    );
  }

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.info(
    `Skipping upload / exiting early since ${METICULOUS_SKIP_UPLOAD_ENV_VAR} is set to true`
  );
  process.exit(0);
};

const shouldSkipUpload = () => {
  return (
    (process.env[METICULOUS_SKIP_UPLOAD_ENV_VAR] ?? "").toLowerCase() === "true"
  );
};
