import { isFetchError } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { SENTRY_FLUSH_TIMEOUT } from "@alwaysmeticulous/sentry";
import * as Sentry from "@sentry/node";
import { CliUserError } from "../utils/cli-user-error";

export const setOptions: (options: unknown) => void = (options) => {
  Sentry.setContext("invoke-options", options as Record<string, unknown>);
};

export const wrapHandler = function wrapHandler_<T>(
  handler: (args: T) => Promise<void>,
): (args: T) => Promise<void> {
  return async (args: T) => {
    await handler(args)
      .then(async () => {
        const currentSpan = Sentry.getActiveSpan();
        if (currentSpan) {
          currentSpan.setStatus({ code: 1 });
          currentSpan.end();
        }
        await Sentry.flush(SENTRY_FLUSH_TIMEOUT.toMillis());

        // This is required: otherwise the process will hang for a while,
        // presumably waiting on some setTimeout to trigger
        process.exit(0);
      })
      .catch(async (error) => {
        const exitCode = reportHandlerError(error);
        const currentSpan = Sentry.getActiveSpan();
        if (currentSpan) {
          currentSpan.setStatus({ code: 2 });
          currentSpan.end();
        }
        await Sentry.flush(SENTRY_FLUSH_TIMEOUT.toMillis());

        // Don't display the help text which can obscure the error
        process.exit(exitCode);
      });
  };
};

const reportHandlerError = (error: unknown): number => {
  const logger = initLogger();

  // User-facing errors: message already explains what to do, and the
  // failure is expected (no Sentry, no --help tip, no stack).
  if (error instanceof CliUserError) {
    logger[error.severity](error.message);
    return error.exitCode;
  }

  if (isFetchError(error)) {
    logger.error(error.message);
    if (
      error.response?.data &&
      error.response.data.error &&
      error.response.data.message
    ) {
      logger.error(error.response.data.message);
    }
    logger.debug(error);
  } else if (error instanceof Error) {
    logger.error(error.message);
    logger.debug(error);
  } else {
    logger.error(error);
  }
  logger.info("");
  logger.info(
    "Tip: run `meticulous <command> --help` for help on a particular command, or `meticulous --help` for a list of the available commands.",
  );
  Sentry.captureException(error);
  return 1;
};
