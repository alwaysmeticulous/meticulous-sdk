import * as Sentry from "@sentry/node";
import { addExtensionMethods } from "@sentry/tracing";
import { Duration } from "luxon";

const SENTRY_DSN =
  "https://10c6a6c9f5434786b37fb81b01323798@o914390.ingest.sentry.io/6435232";
const SENTRY_FLUSH_TIMEOUT = Duration.fromObject({ seconds: 1 });

const getTracesSampleRate: () => number = () => {
  if (
    (process.env["METICULOUS_TELEMETRY_ENABLED"] ?? "true").toLowerCase() ==
    "true"
  ) {
    return 1.0;
  }
  return 0.0;
};

export const initSentry: (meticulousVersion: string) => void = (
  meticulousVersion
) => {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: meticulousVersion,

    tracesSampleRate: getTracesSampleRate(),
  });

  addExtensionMethods();
};

export const setOptions: (options: any) => void = (options) => {
  Sentry.setContext("invoke-options", options);
};

export const reportHandlerError: (error: any) => Promise<void> = async (
  error
) => {
  Sentry.captureException(error);
  await Sentry.flush(SENTRY_FLUSH_TIMEOUT.toMillis());
};

export const wrapHandler = function wrapHandler_<T>(
  handler: (args: T) => Promise<void>
): (args: T) => Promise<void> {
  return async (args: T) => {
    await handler(args)
      .then(() => {
        const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
        if (transaction !== undefined) {
          transaction.setStatus("ok");
        }
      })
      .catch(async (error) => {
        await reportHandlerError(error);
        const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
        if (transaction !== undefined) {
          transaction.setStatus("unknown_error");
        }
        throw error;
      })
      .finally(() => {
        const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
        if (transaction !== undefined) {
          transaction.finish();
        }
      });
  };
};
