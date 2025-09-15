import { join, normalize } from "path";
import { initLogger } from "../logger/console-logger";

let _localDataDir = "";

export const getMeticulousLocalDataDir: () => string = () => {
  const logger = initLogger();
  if (!_localDataDir) {
    setMeticulousLocalDataDir();
    logger.debug(
      `Local data dir has not been set explictly, so defaulting to ${_localDataDir}`
    );
  } else {
    logger.debug(`Using local data dir at ${_localDataDir}`);
  }
  return _localDataDir;
};

export const setMeticulousLocalDataDir: (
  localDataDir?: string | null | undefined
) => void = (localDataDir) => {
  const logger = initLogger();
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
