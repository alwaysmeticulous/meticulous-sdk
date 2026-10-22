import { basename, dirname, join, relative, sep } from "path";
import { CODEX_ROLLOUT_DIRS } from "../../../codex/codex-home-layout";
import { statOrNull } from "../../collect/stat-trace-file";

/** The nearest ancestor holding `sessions` or `archived_sessions`, as `$CODEX_HOME` does. */
export const findCodexHome = async (
  rolloutPath: string | null,
): Promise<string | null> => {
  if (!rolloutPath) {
    return null;
  }
  for (let dir = dirname(rolloutPath); ; dir = dirname(dir)) {
    for (const rolloutDir of CODEX_ROLLOUT_DIRS) {
      if ((await statOrNull(join(dir, rolloutDir)))?.isDirectory()) {
        return dir;
      }
    }
    if (dirname(dir) === dir) {
      return null;
    }
  }
};

/** Matches the uploader's paths when the file is under `codexHome`. */
export const relativeToCodexHome = (
  codexHome: string | null,
  path: string,
): string =>
  codexHome && path.startsWith(`${codexHome}${sep}`)
    ? relative(codexHome, path)
    : basename(path);
