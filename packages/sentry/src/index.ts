import { IS_METICULOUS_SUPER_USER } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { Duration } from "luxon";

/**
 * DSN for SDK project
 */
const SENTRY_DSN =
  "https://10c6a6c9f5434786b37fb81b01323798@o914390.ingest.sentry.io/6435232";
export const SENTRY_FLUSH_TIMEOUT = Duration.fromObject({ seconds: 1 });

const getTracesSampleRate: () => number = () => {
  return parseFloat(process.env["METICULOUS_TELEMETRY_SAMPLE_RATE"] ?? "1.0");
};

/**
 * Initializes Sentry to send errors to the SDK project
 */
export const initSentry: (
  meticulousVersion: string,
  tracesSampleRateOverride?: number
) => Promise<void> = async (meticulousVersion, tracesSampleRateOverride) => {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: meticulousVersion,

    tracesSampleRate: tracesSampleRateOverride ?? getTracesSampleRate(),
    environment:
      __filename.endsWith(".ts") || IS_METICULOUS_SUPER_USER
        ? "development"
        : "production",
    ignoreErrors: [
      "ReplayKillingPossibleUserError",
      "SecureTunnelInactiveForAppUrlError",
    ],
  });
};
