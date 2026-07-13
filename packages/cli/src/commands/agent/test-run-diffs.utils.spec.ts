import type {
  DiffsSummaryReplayDiff,
  DiffsSummaryScreenshot,
} from "@alwaysmeticulous/client";
import { describe, expect, test } from "vitest";
import {
  buildDiffsSummaryHeader,
  buildDiffsSummaryJson,
  type DiffsSummaryColumns,
  flattenDiffRows,
  formatDiffRow,
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

  test("sorts by the global index across replay diffs", () => {
    const rows = flattenDiffRows(data);
    expect(rows.map((r) => r.screenshot.screenshotName)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

describe("buildDiffsSummaryHeader", () => {
  test("emits the base columns (including index) by default", () => {
    expect(buildDiffsSummaryHeader(NO_COLUMNS)).toEqual([
      "replayDiffId",
      "screenshotName",
      "index",
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
      3,
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
      3,
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
    ).toEqual(["rd-1", "home", 1, "different", "0.10000", "", "false", "", ""]);
  });
});

describe("buildDiffsSummaryJson", () => {
  const data: DiffsSummaryReplayDiff[] = [
    replayDiff({
      replayDiffId: "rd-1",
      baseReplayId: "base-1",
      headReplayId: "head-1",
      screenshots: [
        screenshot({
          screenshotName: "a",
          index: 2,
          mismatchFraction: 0.5,
          domDiffIds: "d1",
          isSelected: true,
        }),
        screenshot({
          screenshotName: "b",
          index: 0,
          mismatchFraction: null,
          isSelected: false,
        }),
      ],
    }),
    replayDiff({
      replayDiffId: "rd-2",
      screenshots: [screenshot({ screenshotName: "c", index: 1 })],
    }),
  ];

  test("flat: one object per screenshot in index order, base columns only", () => {
    expect(buildDiffsSummaryJson(data, NO_COLUMNS)).toEqual([
      {
        replayDiffId: "rd-1",
        screenshotName: "b",
        index: 0,
        outcome: "different",
        mismatch: null,
      },
      {
        replayDiffId: "rd-2",
        screenshotName: "c",
        index: 1,
        outcome: "different",
        mismatch: 0.1,
      },
      {
        replayDiffId: "rd-1",
        screenshotName: "a",
        index: 2,
        outcome: "different",
        mismatch: 0.5,
      },
    ]);
  });

  test("flat: gated columns are appended after the base columns", () => {
    expect(
      buildDiffsSummaryJson(data, {
        orderByReplayDiffs: false,
        includeDomDiffIds: true,
        includeAllDiffs: true,
        includeReplayIds: true,
      })[0],
    ).toEqual({
      replayDiffId: "rd-1",
      screenshotName: "b",
      index: 0,
      outcome: "different",
      mismatch: null,
      domDiffIds: null,
      isSelected: false,
      baseReplayId: "base-1",
      headReplayId: "head-1",
    });
  });

  test("nested: one level per replay diff with screenshots grouped underneath", () => {
    expect(
      buildDiffsSummaryJson(data, {
        orderByReplayDiffs: true,
        includeDomDiffIds: true,
        includeAllDiffs: true,
        includeReplayIds: true,
      }),
    ).toEqual([
      {
        replayDiffId: "rd-1",
        baseReplayId: "base-1",
        headReplayId: "head-1",
        screenshots: [
          {
            screenshotName: "a",
            index: 2,
            outcome: "different",
            mismatch: 0.5,
            domDiffIds: "d1",
            isSelected: true,
          },
          {
            screenshotName: "b",
            index: 0,
            outcome: "different",
            mismatch: null,
            domDiffIds: null,
            isSelected: false,
          },
        ],
      },
      {
        replayDiffId: "rd-2",
        baseReplayId: null,
        headReplayId: null,
        screenshots: [
          {
            screenshotName: "c",
            index: 1,
            outcome: "different",
            mismatch: 0.1,
            domDiffIds: null,
            isSelected: false,
          },
        ],
      },
    ]);
  });

  test("nested: base columns only when gated columns are off", () => {
    expect(
      buildDiffsSummaryJson(data, {
        ...NO_COLUMNS,
        orderByReplayDiffs: true,
      })[0],
    ).toEqual({
      replayDiffId: "rd-1",
      screenshots: [
        {
          screenshotName: "a",
          index: 2,
          outcome: "different",
          mismatch: 0.5,
        },
        {
          screenshotName: "b",
          index: 0,
          outcome: "different",
          mismatch: null,
        },
      ],
    });
  });
});
