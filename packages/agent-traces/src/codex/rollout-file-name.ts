const UUID =
  "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}";

/**
 * `rollout-<timestamp>-<threadId>.jsonl`, or `…-<threadId>_<rolloutId>.jsonl`
 * for a file created by reverting a thread. Compressed `.jsonl.zst` rollouts
 * (an off-by-default Codex feature) are not matched.
 */
const ROLLOUT_FILE_NAME_REGEX = new RegExp(
  `^rollout-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2})-(${UUID})(?:_(${UUID}))?\\.jsonl$`,
);

export interface RolloutFileName {
  timestamp: string;
  threadId: string;
  /** Equal to `threadId` except for reverted threads' replacement files. */
  rolloutId: string;
}

export const parseRolloutFileName = (name: string): RolloutFileName | null => {
  const match = ROLLOUT_FILE_NAME_REGEX.exec(name);
  const [, timestamp, threadId, rolloutId] = match ?? [];
  if (!timestamp || !threadId) {
    return null;
  }
  return { timestamp, threadId, rolloutId: rolloutId ?? threadId };
};
