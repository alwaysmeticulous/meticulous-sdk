/**
 * Logging for the sidecar Worker.
 *
 * Deliberately `console`, not a logger: in a Worker these lines are what `wrangler tail` and the
 * Workers Logs dashboard show, and they are how a customer diagnoses a recording that produced
 * nothing. The level comes from the `METICULOUS_LOG_LEVEL` var and defaults to `info` — unlike the
 * shim, which is silent by default because it runs inside the app's own request path.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

let threshold = LEVEL_ORDER.info;

export const setLogLevel = (level: string | undefined): void => {
  if (level !== undefined && level in LEVEL_ORDER) {
    threshold = LEVEL_ORDER[level as LogLevel];
  }
};

const emit = (
  level: LogLevel,
  write: (message: string) => void,
  message: string,
): void => {
  if (LEVEL_ORDER[level] >= threshold) {
    write(`[meticulous-sidecar] ${message}`);
  }
};

export const log = {
  debug: (message: string): void =>
    // eslint-disable-next-line no-console
    emit("debug", (line) => console.log(line), message),
  info: (message: string): void =>
    // eslint-disable-next-line no-console
    emit("info", (line) => console.log(line), message),
  warn: (message: string): void =>
    emit("warn", (line) => console.warn(line), message),
  error: (message: string): void =>
    emit("error", (line) => console.error(line), message),
};
