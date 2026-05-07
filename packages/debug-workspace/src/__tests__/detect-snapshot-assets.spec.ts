import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import { detectSnapshotAssets } from "../generate-debug-workspace";

describe("detectSnapshotAssets", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-detect-snapshot-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const assetsDir = (role: string, replayId: string): string =>
    join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      role,
      replayId,
      "snapshotted-assets",
    );

  it("returns false when the replays directory is missing", () => {
    expect(detectSnapshotAssets(workspace)).toBe(false);
  });

  it("returns false when no snapshotted-assets directories exist", () => {
    mkdirSync(
      join(workspace, DEBUG_DATA_DIRECTORY, "replays", "head", "r1"),
      { recursive: true },
    );
    expect(detectSnapshotAssets(workspace)).toBe(false);
  });

  it("returns false when snapshotted-assets exists but is empty", () => {
    mkdirSync(assetsDir("head", "r1"), { recursive: true });
    expect(detectSnapshotAssets(workspace)).toBe(false);
  });

  it("returns true when at least one role has populated snapshotted-assets", () => {
    mkdirSync(assetsDir("base", "r2"), { recursive: true });
    writeFileSync(join(assetsDir("base", "r2"), "main.js"), "console.log(1);");
    expect(detectSnapshotAssets(workspace)).toBe(true);
  });

  it("scans head, base, and other roles", () => {
    mkdirSync(assetsDir("other", "r3"), { recursive: true });
    writeFileSync(join(assetsDir("other", "r3"), "style.css"), "body {}");
    expect(detectSnapshotAssets(workspace)).toBe(true);
  });

  it("returns false when only unrelated role directories have files", () => {
    const unrelated = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "unknown-role",
      "r4",
      "snapshotted-assets",
    );
    mkdirSync(unrelated, { recursive: true });
    writeFileSync(join(unrelated, "x.js"), "x");
    expect(detectSnapshotAssets(workspace)).toBe(false);
  });
});
