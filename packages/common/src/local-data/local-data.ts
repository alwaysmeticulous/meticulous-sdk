import { AsyncLocalStorage } from "async_hooks";
import { tmpdir } from "os";
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
      `Local data dir has not been set explictly, so defaulting to ${_localDataDir}`,
    );
  } else {
    logger.debug(`Using local data dir at ${_localDataDir}`);
  }
  return _localDataDir;
};

export const setMeticulousLocalDataDir: (
  localDataDir?: string | null,
) => void = (localDataDir) => {
  const logger = initLogger();
  if (_localDataDir) {
    logger.warn(
      "Meticulous local data dir has already been set by a prior call to setMeticulousLocalDataDir()",
    );
  }

  _localDataDir =
    localDataDir || process.env["METICULOUS_DIR"] || getDefaultLocalDataDir();
};

/**
 * Serverless platforms mount the deployment read-only and expose only
 * `os.tmpdir()` as writable, so rooting the data dir at `$HOME`/cwd there makes
 * the very first `mkdir` fail with EROFS/ENOENT. The first thing to need the
 * directory is the SDK bundle download in `fetchAsset`, so on those platforms
 * that failure takes out recording and replay entirely rather than degrading
 * them — and, since callers wrap init in a try/catch so it can never break a
 * boot, it does so silently.
 *
 * The result must stay absolute: callers `require()` bundles from paths built on
 * top of it, and `require()` reads a path starting with neither `.` nor `/` as a
 * package name rather than a file.
 */
const getDefaultLocalDataDir = (): string => {
  const root = hasReadOnlyDeploymentFilesystem()
    ? tmpdir()
    : process.env["HOME"] || process.cwd();
  return normalize(join(root, ".meticulous"));
};

/**
 * `AWS_LAMBDA_FUNCTION_NAME` covers raw Lambda and the platforms built on it
 * (Netlify Functions, SAM); `VERCEL` is checked separately because Vercel does
 * not guarantee the Lambda variables across its compute options.
 */
const hasReadOnlyDeploymentFilesystem = (): boolean =>
  !!process.env["VERCEL"] || !!process.env["AWS_LAMBDA_FUNCTION_NAME"];

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
  fn: () => Promise<T>,
): Promise<T> => {
  let result: Promise<T>;
  asyncLocalDataDir.run(dataDir, () => {
    result = fn();
  });
  return result!;
};
