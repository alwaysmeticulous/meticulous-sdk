import log from "loglevel";
import { join, normalize } from "path";
import { METICULOUS_LOGGER_NAME } from "../logger/console-logger";

let _localDataDir = "";

export const getMeticulousLocalDataDir: (
  localDataDir?: string | null | undefined
) => string = (localDataDir) => {
  if (_localDataDir) {
    return _localDataDir;
  }

  _localDataDir =
    localDataDir ||
    process.env["METICULOUS_DIR"] ||
    normalize(join(process.env["HOME"] || process.cwd(), ".meticulous"));
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.debug(`Meticulous local data dir: ${_localDataDir}`);
  return _localDataDir;
};
