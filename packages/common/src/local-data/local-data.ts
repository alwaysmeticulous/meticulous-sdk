import log from "loglevel";
import { join, normalize } from "path";
import { METICULOUS_LOGGER_NAME } from "../logger/console-logger";

let _localDataDir = "";

export const getMeticulousLocalDataDir: () => string = () => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  if (!_localDataDir) {
    logger.warn(
      "Local data dir has not been set by setMeticulousLocalDataDir()!"
    );
    setMeticulousLocalDataDir();
  }
  logger.debug(`Meticulous local data dir: ${_localDataDir}`);
  return _localDataDir;
};

export const setMeticulousLocalDataDir: (
  localDataDir?: string | null | undefined
) => void = (localDataDir) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  if (_localDataDir) {
    logger.warn(
      "Meticulous local data dir has already been set by a prior call to setMeticulousLocalDataDir()"
    );
  }

  _localDataDir =
    localDataDir ||
    process.env["METICULOUS_DIR"] ||
    normalize(join(process.env["HOME"] || process.cwd(), ".meticulous"));
};
