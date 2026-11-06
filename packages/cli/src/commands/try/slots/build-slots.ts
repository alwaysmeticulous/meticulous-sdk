import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { setTimeout as sleep } from "timers/promises";

/**
 * A fixed number of build slots shared by every backtester through lock files,
 * so installs and builds never all run at once. Waiters take free slots in
 * rank order (then arrival), so the highest-ranked PRs finish first.
 * A holder that never releases (a crashed agent) loses its slot once its lease
 * expires, and a waiter that stops polling drops out of the queue.
 */

export interface SlotDirs {
  held: string;
  waiting: string;
}

export interface AcquireResult {
  acquired: boolean;
  slot: number | null;
  waitedSeconds: number;
  /** Waiters ahead of this one when it gave up; 0 once acquired. */
  ahead: number;
}

interface Holder {
  owner: string;
  rank: number;
  acquiredAt: number;
}

interface Waiter {
  owner: string;
  rank: number;
  since: number;
  heartbeatAt: number;
}

const POLL_MS = 1_000;
const WAITER_STALE_MS = 30_000;

export const acquireBuildSlot = async (options: {
  dirs: SlotDirs;
  slotCount: number;
  owner: string;
  rank: number;
  waitSeconds: number;
  leaseSeconds: number;
}): Promise<AcquireResult> => {
  const startedAt = Date.now();
  for (;;) {
    const attempt = tryAcquire(options);
    const waitedSeconds = Math.round((Date.now() - startedAt) / 1000);
    if (attempt.slot != null) {
      return { acquired: true, slot: attempt.slot, waitedSeconds, ahead: 0 };
    }
    if (Date.now() - startedAt + POLL_MS > options.waitSeconds * 1000) {
      return {
        acquired: false,
        slot: null,
        waitedSeconds,
        ahead: attempt.ahead,
      };
    }
    await sleep(POLL_MS);
  }
};

export const releaseBuildSlot = (dirs: SlotDirs, owner: string): boolean => {
  rmSync(waiterPath(dirs, owner), { force: true });
  const held = readHolders(dirs.held).filter(
    (entry) => entry.holder.owner === owner,
  );
  for (const entry of held) {
    rmSync(entry.path, { force: true });
  }
  return held.length > 0;
};

const tryAcquire = (options: {
  dirs: SlotDirs;
  slotCount: number;
  owner: string;
  rank: number;
  leaseSeconds: number;
}): { slot: number | null; ahead: number } => {
  const { dirs, owner } = options;
  const now = Date.now();
  const holders = readHolders(dirs.held).filter((entry) => {
    const expired =
      now - entry.holder.acquiredAt >= options.leaseSeconds * 1000;
    if (expired) {
      rmSync(entry.path, { force: true });
    }
    return !expired;
  });
  const mine = holders.find((entry) => entry.holder.owner === owner);
  if (mine) {
    rmSync(waiterPath(dirs, owner), { force: true });
    return { slot: mine.slot, ahead: 0 };
  }

  const me = registerWaiter(dirs, owner, options.rank, now);
  const ahead = readWaiters(dirs.waiting, now).filter(
    (waiter) => waiter.owner !== owner && compareWaiters(waiter, me) < 0,
  ).length;
  const heldSlots = new Set(holders.map((entry) => entry.slot));
  const freeSlots = Array.from(
    { length: options.slotCount },
    (_, i) => i,
  ).filter((slot) => !heldSlots.has(slot));
  if (ahead >= freeSlots.length) {
    return { slot: null, ahead };
  }
  const holder: Holder = { owner, rank: options.rank, acquiredAt: now };
  for (const slot of freeSlots) {
    if (createExclusive(join(dirs.held, `${slot}.json`), holder)) {
      rmSync(waiterPath(dirs, owner), { force: true });
      return { slot, ahead: 0 };
    }
  }
  return { slot: null, ahead };
};

/** Keeps the first `since` so a waiter that re-runs acquire keeps its place. */
const registerWaiter = (
  dirs: SlotDirs,
  owner: string,
  rank: number,
  now: number,
): Waiter => {
  const existing = readJson<Waiter>(waiterPath(dirs, owner));
  const fresh =
    existing != null &&
    existing.rank === rank &&
    now - existing.heartbeatAt <= WAITER_STALE_MS;
  const waiter: Waiter = {
    owner,
    rank,
    since: fresh ? existing.since : now,
    heartbeatAt: now,
  };
  writeFileSync(waiterPath(dirs, owner), JSON.stringify(waiter));
  return waiter;
};

const compareWaiters = (a: Waiter, b: Waiter): number =>
  a.rank - b.rank || a.since - b.since || a.owner.localeCompare(b.owner);

const readHolders = (
  dir: string,
): Array<{ slot: number; path: string; holder: Holder }> =>
  readdirSync(dir)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => {
      const path = join(dir, name);
      return {
        slot: Number.parseInt(name, 10),
        path,
        holder: readJson<Holder>(path) ?? unreadableHolder(path),
      };
    });

/** A file caught mid-write still counts as held, dated by its mtime. */
const unreadableHolder = (path: string): Holder => ({
  owner: "",
  rank: Number.MAX_SAFE_INTEGER,
  acquiredAt: tryMtime(path),
});

const readWaiters = (dir: string, now: number): Waiter[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const path = join(dir, name);
      const waiter = readJson<Waiter>(path);
      if (waiter == null || now - waiter.heartbeatAt > WAITER_STALE_MS) {
        rmSync(path, { force: true });
        return [];
      }
      return [waiter];
    });

const waiterPath = (dirs: SlotDirs, owner: string): string =>
  join(dirs.waiting, `${owner}.json`);

const createExclusive = (path: string, value: unknown): boolean => {
  try {
    writeFileSync(path, JSON.stringify(value), { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
};

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
};

const tryMtime = (path: string): number => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
};
