import { join, normalize } from "path";

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
  return _localDataDir;
};
