import { existsSync } from "fs";
import { join } from "path";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";

/** A head replay and the base replay it was compared against. */
export interface ReplayPair {
  /** `<headReplayId>-vs-<baseReplayId>`, used to name per-pair files. */
  label: string;
  headDir: string;
  baseDir: string;
}

/**
 * The replay diffs' head and base replays or, without a replay diff, the two
 * replays given by ID (head first, e.g. `debug replay <id> --baseReplayId`).
 */
export const listReplayPairs = (
  debugContext: DebugContext,
  workspaceDir: string,
): ReplayPair[] => {
  const replaysDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "replays");
  if (debugContext.replayDiffs.length === 0) {
    const [headReplayId, baseReplayId] = debugContext.replayIds;
    return debugContext.replayIds.length === 2
      ? toPair(
          headReplayId,
          join(replaysDir, "other", headReplayId),
          baseReplayId,
          join(replaysDir, "other", baseReplayId),
        )
      : [];
  }
  return debugContext.replayDiffs.flatMap((diff) =>
    toPair(
      diff.headReplayId,
      join(replaysDir, "head", diff.headReplayId),
      diff.baseReplayId,
      join(replaysDir, "base", diff.baseReplayId),
    ),
  );
};

const toPair = (
  headReplayId: string,
  headDir: string,
  baseReplayId: string,
  baseDir: string,
): ReplayPair[] =>
  existsSync(headDir) && existsSync(baseDir)
    ? [{ label: `${headReplayId}-vs-${baseReplayId}`, headDir, baseDir }]
    : [];
