import log from "loglevel";

export const METICULOUS_LOGGER_NAME = "@alwaysmeticulous";

// loglevel caches the logger instance, so if this method is called multiple times,
// we should only apply the timestamps the first time to avoid duplicate timestamps.
let timestampsApplied = false;

export const initLogger: () => log.Logger = () => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.setDefaultLevel(log.levels.INFO);

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
      break;
  }
};
