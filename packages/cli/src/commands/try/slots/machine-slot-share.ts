import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { writeJsonAtomic, type SlotDirs } from "./build-slots";

/**
 * Each trial sizes its build slots for the whole machine, so trials running at
 * once in different repositories split that budget between them: every trial
 * registers its slot dirs here, and a trial gets `buildSlots / busy trials`
 * slots, where a busy trial is one with a slot held or a waiter queued.
 * Outside `METICULOUS_DIR`, which the agent points into its own workspace.
 */
export const defaultMachineRegistryDir = (): string =>
  join(homedir(), ".meticulous", "try", "workspaces");

interface RegistryEntry {
  held: string;
  waiting: string;
}

/** Records this workspace's slot dirs; idempotent. Best effort. */
export const registerSlotWorkspace = (
  registryDir: string,
  dirs: SlotDirs,
): void => {
  try {
    mkdirSync(registryDir, { recursive: true });
    const id = createHash("sha256")
      .update(dirs.held)
      .digest("hex")
      .slice(0, 16);
    const entry: RegistryEntry = { held: dirs.held, waiting: dirs.waiting };
    writeJsonAtomic(join(registryDir, `${id}.json`), entry);
  } catch {
    // An unwritable home dir just means this trial doesn't share its budget.
  }
};

/** This workspace's slot count once the machine's budget is split between busy trials. */
export const sharedSlotCount = (options: {
  registryDir: string;
  ownDirs: SlotDirs;
  slotCount: number;
  leaseSeconds: number;
  waiterStaleMs: number;
  now: number;
}): number => {
  const busy = countBusyWorkspaces(options);
  return Math.max(1, Math.floor(options.slotCount / Math.max(1, busy)));
};

const countBusyWorkspaces = (options: {
  registryDir: string;
  ownDirs: SlotDirs;
  leaseSeconds: number;
  waiterStaleMs: number;
  now: number;
}): number => {
  const others = readRegistry(options.registryDir).filter(
    (entry) => entry.held !== options.ownDirs.held,
  );
  const busyOthers = others.filter((entry) =>
    isBusy(entry, options.leaseSeconds, options.waiterStaleMs, options.now),
  ).length;
  // The caller is about to hold or wait for a slot, so it is busy too.
  return busyOthers + 1;
};

const isBusy = (
  entry: RegistryEntry,
  leaseSeconds: number,
  waiterStaleMs: number,
  now: number,
): boolean =>
  readTimestamps(entry.held, /^\d+\.json$/, "acquiredAt").some(
    (acquiredAt) => now - acquiredAt < leaseSeconds * 1000,
  ) ||
  readTimestamps(entry.waiting, /\.json$/, "heartbeatAt").some(
    (heartbeatAt) => now - heartbeatAt <= waiterStaleMs,
  );

/**
 * Drops entries whose workspace was deleted. An unreadable entry is skipped,
 * never deleted: it may be another trial's, mid-write.
 */
const readRegistry = (registryDir: string): RegistryEntry[] => {
  if (!existsSync(registryDir)) {
    return [];
  }
  return readdirSync(registryDir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const path = join(registryDir, name);
      const entry = readJson<RegistryEntry>(path);
      if (entry == null) {
        return [];
      }
      if (!existsSync(entry.held)) {
        rmSync(path, { force: true });
        return [];
      }
      return [entry];
    });
};

const readTimestamps = (
  dir: string,
  pattern: RegExp,
  field: string,
): number[] => {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => pattern.test(name))
    .flatMap((name) => {
      const value = readJson<Record<string, unknown>>(join(dir, name))?.[field];
      return typeof value === "number" ? [value] : [];
    });
};

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
};
