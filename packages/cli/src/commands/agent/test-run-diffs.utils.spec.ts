import type {
  DiffsSummaryReplayDiff,
  DiffsSummaryScreenshot,
} from "@alwaysmeticulous/client";
import { describe, expect, test } from "vitest";
import {
  buildDiffsSummaryHeader,
  type DiffsSummaryColumns,
  flattenDiffRows,
  formatDiffRow,
  resolveIncludeAllDiffs,
} from "./test-run-diffs.utils";

const screenshot = (
  overrides: Partial<DiffsSummaryScreenshot> & { screenshotName: string },
): DiffsSummaryScreenshot => ({
  index: 0,
  outcome: "different",
  userVisibleOutcome: "difference",
  mismatchFraction: 0.1,
  ...overrides,
});

const replayDiff = (
  overrides: Partial<DiffsSummaryReplayDiff> & { replayDiffId: string },
): DiffsSummaryReplayDiff => ({
  screenshots: [],
  ...overrides,
});

const NO_COLUMNS: DiffsSummaryColumns = {
  orderByReplayDiffs: false,
  includeDomDiffIds: false,
  includeAllDiffs: false,
  includeReplayIds: false,
};

describe("resolveIncludeAllDiffs", () => {
  test("is false when neither flag is set", () => {
    expect(
      resolveIncludeAllDiffs({ includeAllDiffs: false, includeMatches: false }),
    ).toBe(false);
  });

  test("--includeAllDiffs alone enables it", () => {
    expect(
      resolveIncludeAllDiffs({ includeAllDiffs: true, includeMatches: false }),
    ).toBe(true);
  });

  test("--includeMatches implies --includeAllDiffs", () => {
    expect(
      resolveIncludeAllDiffs({ includeAllDiffs: false, includeMatches: true }),
    ).toBe(true);
  });
});

describe("flattenDiffRows", () => {
  const data: DiffsSummaryReplayDiff[] = [
    replayDiff({
      replayDiffId: "rd-1",
      screenshots: [
        screenshot({ screenshotName: "a", index: 2 }),
        screenshot({ screenshotName: "b", index: 0 }),
      ],
    }),
    replayDiff({
      replayDiffId: "rd-2",
      screenshots: [screenshot({ screenshotName: "c", index: 1 })],
    }),
  ];

  test("sorts by priority index across replay diffs by default", () => {
    const rows = flattenDiffRows(data, false);
    expect(rows.map((r) => r.screenshot.screenshotName)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  test("preserves replay-diff grouping order with orderByReplayDiffs", () => {
    const rows = flattenDiffRows(data, true);
    expect(rows.map((r) => r.screenshot.screenshotName)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("buildDiffsSummaryHeader", () => {
  test("emits only the base columns by default", () => {
    expect(buildDiffsSummaryHeader(NO_COLUMNS)).toEqual([
      "replayDiffId",
      "screenshotName",
      "outcome",
      "mismatch",
    ]);
  });

  test("adds index/total only with orderByReplayDiffs", () => {
    expect(
      buildDiffsSummaryHeader({ ...NO_COLUMNS, orderByReplayDiffs: true }),
    ).toEqual([
      "replayDiffId",
      "screenshotName",
      "index",
      "total",
      "outcome",
      "mismatch",
    ]);
  });

  test("gates the optional columns independently", () => {
    expect(
      buildDiffsSummaryHeader({
        orderByReplayDiffs: true,
        includeDomDiffIds: true,
        includeAllDiffs: true,
        includeReplayIds: true,
      }),
    ).toEqual([
      "replayDiffId",
      "screenshotName",
      "index",
      "total",
      "outcome",
      "mismatch",
      "domDiffIds",
      "isSelected",
      "baseReplayId",
      "headReplayId",
    ]);
  });
});

describe("formatDiffRow", () => {
  const row = {
    replayDiff: replayDiff({
      replayDiffId: "rd-1",
      baseReplayId: "base-1",
      headReplayId: "head-1",
    }),
    screenshot: screenshot({
      screenshotName: "home",
      index: 3,
      total: 7,
      outcome: "different",
      mismatchFraction: 0.12345678,
      domDiffIds: "d1,d2",
      isSelected: true,
    }),
  };

  test("emits the base columns and formats the mismatch fraction", () => {
    expect(formatDiffRow(row, NO_COLUMNS)).toEqual([
      "rd-1",
      "home",
      "different",
      "0.12346",
    ]);
  });

  test("renders a null mismatch fraction as an empty string", () => {
    const withNull = {
      ...row,
      screenshot: { ...row.screenshot, mismatchFraction: null },
    };
    expect(formatDiffRow(withNull, NO_COLUMNS)).toEqual([
      "rd-1",
      "home",
      "different",
      "",
    ]);
  });

  test("includes the gated columns in header order when enabled", () => {
    expect(
      formatDiffRow(row, {
        orderByReplayDiffs: true,
        includeDomDiffIds: true,
        includeAllDiffs: true,
        includeReplayIds: true,
      }),
    ).toEqual([
      "rd-1",
      "home",
      3,
      7,
      "different",
      "0.12346",
      "d1,d2",
      "true",
      "base-1",
      "head-1",
    ]);
  });

  test("falls back when optional screenshot fields are absent", () => {
    const sparse = {
      replayDiff: replayDiff({ replayDiffId: "rd-1" }),
      screenshot: screenshot({ screenshotName: "home", index: 1 }),
    };
    expect(
      formatDiffRow(sparse, {
        orderByReplayDiffs: true,
        includeDomDiffIds: true,
        includeAllDiffs: true,
        includeReplayIds: true,
      }),
    ).toEqual([
      "rd-1",
      "home",
      1,
      "",
      "different",
      "0.10000",
      "",
      "false",
      "",
      "",
    ]);
  });
});
