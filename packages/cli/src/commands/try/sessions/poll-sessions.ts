export interface SessionCountPollResult {
  reached: boolean;
  count: number;
  sessionIds: string[];
  waitedSeconds: number;
}

/**
 * Polls `listSessionIds` until it returns at least `min` ids or the timeout
 * passes. Always polls once, so a zero timeout is a plain count.
 */
export const pollUntilSessionCount = async (options: {
  min: number;
  timeoutSeconds: number;
  intervalSeconds: number;
  listSessionIds: () => Promise<string[]>;
  onProgress: (count: number) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SessionCountPollResult> => {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const startedAt = now();
  const deadline = startedAt + options.timeoutSeconds * 1000;

  for (;;) {
    const sessionIds = await options.listSessionIds();
    const waitedSeconds = Math.round((now() - startedAt) / 1000);
    if (sessionIds.length >= options.min) {
      return {
        reached: true,
        count: sessionIds.length,
        sessionIds,
        waitedSeconds,
      };
    }
    if (now() + options.intervalSeconds * 1000 > deadline) {
      return {
        reached: false,
        count: sessionIds.length,
        sessionIds,
        waitedSeconds,
      };
    }
    options.onProgress(sessionIds.length);
    await sleep(options.intervalSeconds * 1000);
  }
};
