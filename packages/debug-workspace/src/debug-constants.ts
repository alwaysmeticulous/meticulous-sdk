import { join } from "path";
import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";

export const DEBUG_DATA_DIRECTORY = "debug-data";

export const DEBUG_SESSIONS_DIR_NAME = "debug-sessions";

export const getDebugSessionsDir = (): string =>
  join(getMeticulousLocalDataDir(), DEBUG_SESSIONS_DIR_NAME);
