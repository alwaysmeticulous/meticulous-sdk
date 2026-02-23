import { AsyncLocalStorage } from "async_hooks";
import { join, normalize } from "path";
import { initLogger } from "../logger/console-logger";

const asyncLocalDataDir = new AsyncLocalStorage<string>();

let _localDataDir = "";

export const getMeticulousLocalDataDir: () => string = () => {
  const asyncDir = asyncLocalDataDir.getStore();
  if (asyncDir) {
    return asyncDir;
  }

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

/**
 * Runs `fn` with `getMeticulousLocalDataDir()` returning `dataDir` for the
 * duration of the call (and any async continuations originating from it).
 *
 * This is backed by `AsyncLocalStorage`, so concurrent calls each see their
 * own isolated data directory. Callers outside any `runWithLocalDataDir` scope
 * continue to use the global `_localDataDir` / default — fully backwards-compatible.
 */
export const runWithLocalDataDir = <T>(
  dataDir: string,
  fn: () => Promise<T>
): Promise<T> => {
  return asyncLocalDataDir.run(dataDir, fn);
};
