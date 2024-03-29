import log from "loglevel";

export const METICULOUS_LOGGER_NAME = "@alwaysmeticulous";

export const initLogger: () => log.Logger = () => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.setDefaultLevel(log.levels.INFO);

  return logger;
};

export const setLogLevel: (logLevel: string | undefined) => void = (
  logLevel
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
