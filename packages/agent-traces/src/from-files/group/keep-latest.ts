import type { SkippedTracePath, TraceFile } from "../trace-files.types";

/**
 * One item per key: the one whose file was modified last. The others are
 * reported as skipped.
 */
export const keepLatestPerKey = <T>(
  items: T[],
  keyOf: (item: T) => string,
  fileOf: (item: T) => TraceFile,
  skipped: SkippedTracePath[],
): T[] => {
  const latest = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = latest.get(key);
    if (!existing) {
      latest.set(key, item);
      continue;
    }
    const [kept, dropped] =
      fileOf(item).mtimeMs > fileOf(existing).mtimeMs
        ? [item, existing]
        : [existing, item];
    latest.set(key, kept);
    skipped.push({
      path: fileOf(dropped).path,
      reason: `session ${key} is also in ${fileOf(kept).path}, which is newer`,
    });
  }
  return [...latest.values()];
};
