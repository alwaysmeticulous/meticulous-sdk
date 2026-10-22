import type { Stats } from "fs";
import { realpath, stat } from "fs/promises";
import type { TraceFile } from "../trace-files.types";

export const statOrNull = async (path: string): Promise<Stats | null> => {
  try {
    return await stat(path);
  } catch {
    return null;
  }
};

/** For a file found beside the ones collected, e.g. a session's subagents. */
export const statTraceFile = async (
  path: string,
): Promise<TraceFile | null> => {
  const stats = await statOrNull(path);
  return stats?.isFile() ? toTraceFile(path, stats, false) : null;
};

export const toTraceFile = async (
  path: string,
  stats: Stats,
  explicit: boolean,
): Promise<TraceFile> => ({
  path,
  realPath: await realpath(path),
  explicit,
  sizeBytes: stats.size,
  mtimeMs: stats.mtimeMs,
});
