import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireBuildSlot,
  WAITER_STALE_MS,
  type SlotDirs,
} from "../slots/build-slots";
import {
  registerSlotWorkspace,
  sharedSlotCount,
} from "../slots/machine-slot-share";

const LEASE_SECONDS = 3600;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "try-share-"));
  roots.push(root);
  return root;
};

const makeWorkspace = (root: string, name: string): SlotDirs => {
  const dirs = {
    held: join(root, name, "held"),
    waiting: join(root, name, "waiting"),
  };
  mkdirSync(dirs.held, { recursive: true });
  mkdirSync(dirs.waiting, { recursive: true });
  return dirs;
};

const share = (registryDir: string, ownDirs: SlotDirs, now = Date.now()) =>
  sharedSlotCount({
    registryDir,
    ownDirs,
    slotCount: 4,
    leaseSeconds: LEASE_SECONDS,
    waiterStaleMs: WAITER_STALE_MS,
    now,
  });

describe("machine-wide build slot sharing", () => {
  it("keeps the whole budget while no other trial is building", () => {
    const root = makeRoot();
    const registry = join(root, "registry");
    const a = makeWorkspace(root, "a");
    const b = makeWorkspace(root, "b");
    registerSlotWorkspace(registry, a);
    registerSlotWorkspace(registry, b);

    expect(share(registry, a)).toBe(4);
  });

  it("splits the budget with a trial that holds or waits for a slot", () => {
    const root = makeRoot();
    const registry = join(root, "registry");
    const a = makeWorkspace(root, "a");
    const b = makeWorkspace(root, "b");
    const c = makeWorkspace(root, "c");
    for (const dirs of [a, b, c]) {
      registerSlotWorkspace(registry, dirs);
    }
    const now = Date.now();
    writeFileSync(
      join(b.held, "0.json"),
      JSON.stringify({ owner: "pr-1", rank: 1, acquiredAt: now }),
    );
    expect(share(registry, a, now)).toBe(2);

    writeFileSync(
      join(c.waiting, "pr-2.json"),
      JSON.stringify({ owner: "pr-2", rank: 1, since: now, heartbeatAt: now }),
    );
    expect(share(registry, a, now)).toBe(1);
  });

  it("ignores expired holders, stale waiters and deleted workspaces", () => {
    const root = makeRoot();
    const registry = join(root, "registry");
    const a = makeWorkspace(root, "a");
    const b = makeWorkspace(root, "b");
    const c = makeWorkspace(root, "c");
    for (const dirs of [a, b, c]) {
      registerSlotWorkspace(registry, dirs);
    }
    const now = Date.now();
    writeFileSync(
      join(b.held, "0.json"),
      JSON.stringify({
        owner: "pr-1",
        rank: 1,
        acquiredAt: now - LEASE_SECONDS * 1000 - 1,
      }),
    );
    writeFileSync(
      join(b.waiting, "pr-2.json"),
      JSON.stringify({
        owner: "pr-2",
        rank: 1,
        since: now,
        heartbeatAt: now - WAITER_STALE_MS - 1,
      }),
    );
    writeFileSync(
      join(c.held, "0.json"),
      JSON.stringify({ owner: "pr-3", rank: 1, acquiredAt: now }),
    );
    rmSync(join(root, "c"), { recursive: true });

    expect(share(registry, a, now)).toBe(4);
  });

  it("keeps an unreadable registry entry, which may be mid-write", () => {
    const root = makeRoot();
    const registry = join(root, "registry");
    const a = makeWorkspace(root, "a");
    const b = makeWorkspace(root, "b");
    registerSlotWorkspace(registry, a);
    registerSlotWorkspace(registry, b);
    const [bEntry] = readdirSync(registry).filter((name) =>
      readFileSync(join(registry, name), "utf8").includes(b.held),
    );
    const bEntryContent = readFileSync(join(registry, bEntry), "utf8");
    writeFileSync(join(registry, bEntry), "");

    expect(share(registry, a)).toBe(4);
    expect(readdirSync(registry)).toContain(bEntry);

    writeFileSync(join(registry, bEntry), bEntryContent);
    const now = Date.now();
    writeFileSync(
      join(b.held, "0.json"),
      JSON.stringify({ owner: "pr-1", rank: 1, acquiredAt: now }),
    );
    expect(share(registry, a, now)).toBe(2);
  });

  it("stops handing out slots past a count that shrank until enough are released", async () => {
    const root = makeRoot();
    const dirs = makeWorkspace(root, "a");
    let count = 3;
    const acquire = (owner: string) =>
      acquireBuildSlot({
        dirs,
        slotCount: () => count,
        owner,
        rank: 100,
        waitSeconds: 0,
        leaseSeconds: LEASE_SECONDS,
      });
    for (const owner of ["pr-1", "pr-2", "pr-3"]) {
      expect(await acquire(owner)).toMatchObject({ acquired: true });
    }

    count = 2;
    expect(await acquire("pr-4")).toMatchObject({
      acquired: false,
      slotCount: 2,
    });
  });
});
