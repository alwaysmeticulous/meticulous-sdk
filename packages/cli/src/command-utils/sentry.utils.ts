import { isFetchError } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { SENTRY_FLUSH_TIMEOUT } from "@alwaysmeticulous/sentry";
import * as Sentry from "@sentry/node";
import type {
  CiFailureReason,
  CiSkipReason,
} from "../commands/ci/ci-command-result";
import { printJson } from "./print-json";
import { CliUserError } from "../utils/cli-user-error";
import { OutOfDateCLIError } from "../utils/out-of-date-client-error";

export const setOptions: (options: unknown) => void = (options) => {
  Sentry.setContext("invoke-options", options as Record<string, unknown>);
};

export const wrapHandler = function wrapHandler_<T>(
  handler: (args: T) => Promise<void>,
  options: { structuredErrors?: boolean } = {},
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
        const exitCode = reportHandlerError(error, {
          json:
            options.structuredErrors === true &&
            (args as { json?: boolean }).json === true,
        });
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

const reportHandlerError = (
  error: unknown,
  { json }: { json: boolean },
): number => {
  const logger = initLogger();

  // User-facing errors: message already explains what to do, and the
  // failure is expected (no Sentry, no --help tip, no stack).
  if (error instanceof CliUserError) {
    logger[error.severity](error.message);
    if (json) {
      if (error.outcome === "skipped" && error.reason) {
        printJson({
          outcome: "skipped",
          reason: error.reason as CiSkipReason,
          message: error.message,
          testRunId: null,
          status: null,
        });
      } else {
        printJson({
          outcome: "failed",
          reason: (error.reason as CiFailureReason | undefined) ?? "usage",
          message: error.message,
        });
      }
    }
    return error.exitCode;
  }

  const message = getErrorMessage(error);
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
  if (json) {
    printJson({
      outcome: "failed",
      reason: classifyFailureReason(error),
      message,
    });
  }
  logger.info("");
  logger.info(
    "Tip: run `meticulous <command> --help` for help on a particular command, or `meticulous --help` for a list of the available commands.",
  );
  Sentry.captureException(error);
  return 1;
};

const getErrorMessage = (error: unknown): string => {
  if (isFetchError(error)) {
    return error.response?.data?.message ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

const classifyFailureReason = (error: unknown): CiFailureReason => {
  if (error instanceof OutOfDateCLIError) {
    return "cli_out_of_date";
  }
  if (isFetchError(error)) {
    const status = error.response?.status;
    return status === 401 || status === 403 ? "auth" : "remote";
  }
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (
    code === "ENOENT" ||
    code === "EACCES" ||
    code === "EPERM" ||
    code === "ENOTDIR"
  ) {
    return "environment";
  }
  return "unexpected";
};
