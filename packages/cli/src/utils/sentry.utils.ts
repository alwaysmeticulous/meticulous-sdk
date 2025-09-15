import { isFetchError } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { SENTRY_FLUSH_TIMEOUT } from "@alwaysmeticulous/sentry";
import * as Sentry from "@sentry/node";

export const setOptions: (options: any) => void = (options) => {
  Sentry.setContext("invoke-options", options);
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
        await reportHandlerError(error);
        const currentSpan = Sentry.getActiveSpan();
        if (currentSpan) {
          currentSpan.setStatus({ code: 2 });
          currentSpan.end();
        }
        await Sentry.flush(SENTRY_FLUSH_TIMEOUT.toMillis());

        // Don't display the help text which can obscure the error
        process.exit(1);
      });
  };
};

const reportHandlerError: (error: unknown) => Promise<void> = async (error) => {
  const logger = initLogger();
  logger.info("");
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
};
