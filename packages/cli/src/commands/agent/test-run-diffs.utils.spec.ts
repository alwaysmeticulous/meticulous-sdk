import type { DiffsSummaryDiff } from "@alwaysmeticulous/client";
import { describe, expect, test } from "vitest";
import {
  buildDiffsSummaryHeader,
  type DiffsSummaryColumns,
  formatDiffRow,
  formatDiffsSummaryCounts,
} from "./test-run-diffs.utils";

const NO_COLUMNS: DiffsSummaryColumns = {
  includeDomDiffIds: false,
  includeReplayIds: false,
  includeMismatchFraction: false,
  includeReviews: false,
};

const ALL_COLUMNS: DiffsSummaryColumns = {
  includeDomDiffIds: true,
  includeReplayIds: true,
  includeMismatchFraction: true,
  includeReviews: true,
};

const FULLY_POPULATED_DIFF: Required<DiffsSummaryDiff> = {
  replayDiffId: "rd-1",
  screenshotName: "home",
  mismatchFraction: 0.12345678,
  domDiffIds: "d1,d2",
  decision: "accepted",
  openComments: 2,
  baseReplayId: "base-1",
  headReplayId: "head-1",
};

describe("formatDiffsSummaryCounts", () => {
  test("emits key:\\tvalue lines for every count", () => {
    expect(
      formatDiffsSummaryCounts({
        numReplays: 5,
        numDiffs: 3,
        numApproved: 1,
        numIgnored: 0,
        numRejected: 1,
        numUnreviewed: 1,
        numWithOpenComments: 2,
      }),
    ).toEqual([
      "numReplays:\t5",
      "numDiffs:\t3",
      "numApproved:\t1",
      "numIgnored:\t0",
      "numRejected:\t1",
      "numUnreviewed:\t1",
      "numWithOpenComments:\t2",
    ]);
  });
});

describe("buildDiffsSummaryHeader", () => {
  test("emits only identifying columns by default", () => {
    expect(buildDiffsSummaryHeader(NO_COLUMNS)).toEqual([
      "replayDiffId",
      "screenshotName",
    ]);
  });

  test("gates optional columns independently and in JSON field order", () => {
    expect(buildDiffsSummaryHeader(ALL_COLUMNS)).toEqual([
      "replayDiffId",
      "screenshotName",
      "mismatchFraction",
      "domDiffIds",
      "decision",
      "openComments",
      "baseReplayId",
      "headReplayId",
    ]);
  });

  // Pins the invariant from .claude/rules/agent-command-descriptions.md: TSV
  // headers must match JSON key names. buildDiffsSummaryHeader, flattenDiffsSummary
  // (backend), and the client's legacy-normalize flatten each independently encode
  // this field order — this is the cheap check that catches them drifting apart.
  test("header names and order match DiffsSummaryDiff's own key order", () => {
    expect(buildDiffsSummaryHeader(ALL_COLUMNS)).toEqual(
      Object.keys(FULLY_POPULATED_DIFF),
    );
  });

  // ALL_COLUMNS exercises `decision`/`openComments`'s position alongside every
  // other column, but always with them all on together — this isolates
  // includeReviews so a regression that ties them to the wrong flag (e.g.
  // includeIsSelected) still gets caught.
  test("gates the review columns independently of the other columns", () => {
    expect(
      buildDiffsSummaryHeader({ ...NO_COLUMNS, includeReviews: true }),
    ).toEqual(["replayDiffId", "screenshotName", "decision", "openComments"]);
  });
});

describe("formatDiffRow", () => {
  const diff: DiffsSummaryDiff = FULLY_POPULATED_DIFF;

  test("emits only identifying values by default", () => {
    expect(formatDiffRow(diff, NO_COLUMNS)).toEqual(["rd-1", "home"]);
  });

  test("formats the mismatch fraction when requested", () => {
    expect(
      formatDiffRow(diff, { ...NO_COLUMNS, includeMismatchFraction: true }),
    ).toEqual(["rd-1", "home", "0.12346"]);
  });

  test("includes every requested column in header order", () => {
    expect(formatDiffRow(diff, ALL_COLUMNS)).toEqual([
      "rd-1",
      "home",
      "0.12346",
      "d1,d2",
      "accepted",
      2,
      "base-1",
      "head-1",
    ]);
  });

  test("uses empty/default values for requested but absent fields", () => {
    expect(
      formatDiffRow(
        { replayDiffId: "rd-1", screenshotName: "home" },
        ALL_COLUMNS,
      ),
    ).toEqual(["rd-1", "home", "", "", "", 0, "", ""]);
  });

  test("gates the review columns independently of the other columns", () => {
    expect(
      formatDiffRow(diff, { ...NO_COLUMNS, includeReviews: true }),
    ).toEqual(["rd-1", "home", "accepted", 2]);
  });

  test("uses empty/default review values when absent", () => {
    expect(
      formatDiffRow(
        { replayDiffId: "rd-1", screenshotName: "home" },
        { ...NO_COLUMNS, includeReviews: true },
      ),
    ).toEqual(["rd-1", "home", "", 0]);
  });
});
