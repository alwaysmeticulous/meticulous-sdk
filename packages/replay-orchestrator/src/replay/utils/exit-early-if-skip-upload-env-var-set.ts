import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";

const METICULOUS_SKIP_UPLOAD_ENV_VAR = "METICULOUS_SKIP_UPLOAD";

// Uploading the zip can take a long time, so we expose a env variable to support skipping it
// We don't expose this as a first-class CLI option because we don't want to pollute the list of CLI options
export const exitEarlyIfSkipUploadEnvVarSet = (
  baseTestRunId: string | null | undefined
) => {
  if (!shouldSkipUpload()) {
    return;
  }

  if (baseTestRunId != null) {
    throw new Error(
      `Cannot specify baseTestRunId and compare to base results when ${METICULOUS_SKIP_UPLOAD_ENV_VAR} is set to true`
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
