import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import { generateDiffSummaries } from "../generate-diff-summaries";

const COMPARED = {
  headScreenshotFile: "head.png",
  baseScreenshotFile: "base.png",
  diffFullFile: "diffs/full.png",
  width: 1280,
  height: 720,
  mismatchPixels: 512,
  mismatchFraction: 0.000556,
  diffHash: "ab12cd34",
};

describe("generateDiffSummaries", () => {
  let workspaceDir: string;
  let diffsDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "diff-summaries-"));
    diffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "diffs");
    mkdirSync(diffsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  const summarize = (screenshotDiffResults: unknown[]): unknown => {
    writeFileSync(
      join(diffsDir, "rd-1.json"),
      JSON.stringify({ data: { screenshotDiffResults } }),
    );
    generateDiffSummaries(workspaceDir);
    return JSON.parse(
      readFileSync(join(diffsDir, "rd-1.summary.json"), "utf8"),
    );
  };

  it("reads a diff's comparison from the result itself", () => {
    expect(
      summarize([
        {
          identifier: { type: "end-state" },
          outcome: "diff",
          ...COMPARED,
          changedSectionsClassNames: ["status-cell"],
          diffInBoundingBoxOfIgnoredElement: false,
        },
      ]),
    ).toEqual([
      {
        identifier: { type: "end-state" },
        outcome: "diff",
        width: 1280,
        height: 720,
        mismatchPixels: 512,
        mismatchFraction: 0.000556,
        mismatchPercent: "0.0556%",
        diffHash: "ab12cd34",
        diffInBoundingBoxOfIgnoredElement: false,
        changedSectionsClassNames: ["status-cell"],
      },
    ]);
  });

  it("reads a flake's comparison from its original diff, with its evidence", () => {
    expect(
      summarize([
        {
          identifier: { type: "after-event", eventNumber: 3 },
          outcome: "flake",
          evidence: "diff-is-known-flake",
          diffToBaseScreenshot: { outcome: "diff", ...COMPARED },
          diffsToHeadScreenshotOnRetries: [],
        },
      ]),
    ).toEqual([
      {
        identifier: { type: "after-event", eventNumber: 3 },
        outcome: "flake",
        evidence: "diff-is-known-flake",
        width: 1280,
        height: 720,
        mismatchPixels: 512,
        mismatchFraction: 0.000556,
        mismatchPercent: "0.0556%",
        diffHash: "ab12cd34",
      },
    ]);
  });

  it("keeps only the outcome for a screenshot that was not compared", () => {
    expect(
      summarize([
        { identifier: { type: "end-state" }, outcome: "missing-base" },
      ]),
    ).toEqual([{ identifier: { type: "end-state" }, outcome: "missing-base" }]);
  });
});
