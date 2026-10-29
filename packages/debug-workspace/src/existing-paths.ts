import { existsSync } from "fs";
import { join } from "path";

/**
 * The entries of `paths` (relative to `debug-data/`, optionally ending in a
 * glob such as `dom-diffs/*.summary.txt`) whose file or directory exists, so
 * `context.json` doesn't send an agent looking for files this workspace
 * doesn't have.
 */
export const pickExistingPaths = <K extends string>(
  debugDataDir: string,
  paths: Record<K, string>,
): Partial<Record<K, string>> =>
  Object.fromEntries(
    Object.entries<string>(paths).filter(([, path]) =>
      existsSync(join(debugDataDir, path.split("*")[0])),
    ),
  ) as Partial<Record<K, string>>;
