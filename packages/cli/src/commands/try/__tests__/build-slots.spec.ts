import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireBuildSlot,
  releaseBuildSlot,
  type SlotDirs,
} from "../slots/build-slots";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const makeDirs = (): SlotDirs => {
  const root = mkdtempSync(join(tmpdir(), "try-slots-"));
  roots.push(root);
  const dirs = { held: join(root, "held"), waiting: join(root, "waiting") };
  mkdirSync(dirs.held);
  mkdirSync(dirs.waiting);
  return dirs;
};

const acquire = (
  dirs: SlotDirs,
  owner: string,
  options: { rank?: number; leaseSeconds?: number } = {},
) =>
  acquireBuildSlot({
    dirs,
    slotCount: 2,
    owner,
    rank: options.rank ?? 100,
    waitSeconds: 0,
    leaseSeconds: options.leaseSeconds ?? 3600,
  });

describe("build slots", () => {
  it("hands out at most slotCount slots and frees them on release", async () => {
    const dirs = makeDirs();
    expect(await acquire(dirs, "pr-1")).toMatchObject({
      acquired: true,
      slot: 0,
    });
    expect(await acquire(dirs, "pr-2")).toMatchObject({
      acquired: true,
      slot: 1,
    });
    expect(await acquire(dirs, "pr-3")).toMatchObject({
      acquired: false,
      slot: null,
    });

    expect(releaseBuildSlot(dirs, "pr-1")).toBe(true);
    expect(releaseBuildSlot(dirs, "pr-1")).toBe(false);
    expect(await acquire(dirs, "pr-3")).toMatchObject({
      acquired: true,
      slot: 0,
    });
    expect(readdirSync(dirs.waiting)).toEqual([]);
  });

  it("returns the slot an owner already holds", async () => {
    const dirs = makeDirs();
    await acquire(dirs, "pr-1");
    expect(await acquire(dirs, "pr-1")).toMatchObject({
      acquired: true,
      slot: 0,
    });
    expect(readdirSync(dirs.held)).toEqual(["0.json"]);
  });

  it("gives a freed slot to the best-ranked waiter first", async () => {
    const dirs = makeDirs();
    await acquire(dirs, "pr-1");
    await acquire(dirs, "pr-2");
    expect(await acquire(dirs, "pr-8", { rank: 8 })).toMatchObject({
      acquired: false,
      ahead: 0,
    });
    expect(await acquire(dirs, "pr-3", { rank: 3 })).toMatchObject({
      acquired: false,
      ahead: 0,
    });

    releaseBuildSlot(dirs, "pr-1");
    expect(await acquire(dirs, "pr-8", { rank: 8 })).toMatchObject({
      acquired: false,
      ahead: 1,
    });
    expect(await acquire(dirs, "pr-3", { rank: 3 })).toMatchObject({
      acquired: true,
    });
    expect(await acquire(dirs, "pr-8", { rank: 8 })).toMatchObject({
      acquired: false,
      ahead: 0,
    });
  });

  it("reclaims a slot whose lease has expired", async () => {
    const dirs = makeDirs();
    await acquire(dirs, "pr-1");
    await acquire(dirs, "pr-2");
    expect(await acquire(dirs, "pr-3", { leaseSeconds: 0 })).toMatchObject({
      acquired: true,
    });
  });
});
