import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickExistingPaths } from "../existing-paths";

describe("pickExistingPaths", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "existing-paths-"));
    mkdirSync(join(dir, "dom-diffs"));
    writeFileSync(join(dir, "pr-diff.txt"), "");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps only files and directories that exist, globs by their directory", () => {
    expect(
      pickExistingPaths(dir, {
        prDiff: "pr-diff.txt",
        prDescription: "pr-description.txt",
        domDiffs: "dom-diffs/",
        domDiffsSummary: "dom-diffs/*.summary.txt",
        errorsDiff: "errors-diff/",
      }),
    ).toEqual({
      prDiff: "pr-diff.txt",
      domDiffs: "dom-diffs/",
      domDiffsSummary: "dom-diffs/*.summary.txt",
    });
  });
});
