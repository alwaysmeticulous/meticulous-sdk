import log from "loglevel";

export const METICULOUS_LOGGER_NAME = "@alwaysmeticulous";

// loglevel caches the logger instance, so if this method is called multiple times,
// we should only apply the timestamps the first time to avoid duplicate timestamps.
let timestampsApplied = false;

// Tracks whether a level was explicitly chosen via `setLogLevel`. In Node there
// is no persisted level, so `setDefaultLevel` would otherwise reset the level
// back to INFO on every `initLogger` call — clobbering an explicit `--logLevel`
// / `--verbose` choice. Once a level is set explicitly we stop applying the
// default.
let explicitLevelSet = false;

export const initLogger: () => log.Logger = () => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  if (!explicitLevelSet) {
    logger.setDefaultLevel(log.levels.INFO);
  }

  if (process.env.METICULOUS_TIMESTAMP_LOGS === "true" && !timestampsApplied) {
    const originalFactory = logger.methodFactory;
    logger.methodFactory = (methodName, logLevel, loggerName) => {
      const rawMethod = originalFactory(methodName, logLevel, loggerName);
      return (...args) => {
        const timestamp = new Date().toISOString();
        rawMethod(`[${timestamp}]`, ...args);
      };
    };
    timestampsApplied = true;
  }

  return logger;
};

export const setLogLevel: (logLevel: string | undefined) => void = (
  logLevel,
) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  switch ((logLevel || "").toLocaleLowerCase()) {
    case "trace":
      logger.setLevel(log.levels.TRACE, false);
      break;
    case "debug":
      logger.setLevel(log.levels.DEBUG, false);
      break;
    case "info":
      logger.setLevel(log.levels.INFO, false);
      break;
    case "warn":
      logger.setLevel(log.levels.WARN, false);
      break;
    case "error":
      logger.setLevel(log.levels.ERROR, false);
      break;
    case "silent":
      logger.setLevel(log.levels.SILENT, false);
      break;
    default:
      return;
  }
  explicitLevelSet = true;
};

/**
 * Writes a verbose progress line to **stderr** (so stdout stays reserved for
 * machine-readable output), shown only when the logger level is INFO or more
 * verbose — i.e. under `--verbose` / `--logLevel info|debug|trace`. Use for
 * step-by-step progress that should be hidden by default.
 *
 * Uses `console.error` (stderr in Node, the console in browsers) deliberately:
 * the loglevel logger's `info` level writes to stdout, which would interleave
 * progress with machine-readable output.
 */
export const logProgress: (message: string) => void = (message) => {
  if (initLogger().getLevel() <= log.levels.INFO) {
    console.error(message);
  }
};

/**
 * Writes an always-on diagnostic line to **stderr** (shown regardless of
 * `--verbose`), so stdout stays reserved for machine-readable output. Use for
 * warnings and essential notices that must always surface.
 */
export const logNotice: (message: string) => void = (message) => {
  console.error(message);
};
