import * as Sentry from "@sentry/node";
import { addExtensionMethods } from "@sentry/tracing";
import { Duration } from "luxon";

const SENTRY_DSN =
  "https://10c6a6c9f5434786b37fb81b01323798@o914390.ingest.sentry.io/6435232";
export const SENTRY_FLUSH_TIMEOUT = Duration.fromObject({ seconds: 1 });

const getTracesSampleRate: () => number = () => {
  return parseFloat(process.env["METICULOUS_TELEMETRY_SAMPLE_RATE"] ?? "1.0");
};

export const initSentry: (
  meticulousVersion: string,
  tracesSampleRateOverride?: number
) => Promise<Sentry.Hub> = async (
  meticulousVersion,
  tracesSampleRateOverride
) => {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: meticulousVersion,

    tracesSampleRate: tracesSampleRateOverride ?? getTracesSampleRate(),
    environment: __filename.endsWith(".ts") ? "development" : "production",
  });

  addExtensionMethods();

  return Sentry.getCurrentHub();
};
