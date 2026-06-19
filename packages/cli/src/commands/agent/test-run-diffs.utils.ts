import {
  DiffsSummaryReplayDiff,
  DiffsSummaryScreenshot,
} from "@alwaysmeticulous/client";

/** A single (replay diff, screenshot) pair — one row of the TSV output. */
export interface DiffRow {
  replayDiff: DiffsSummaryReplayDiff;
  screenshot: DiffsSummaryScreenshot;
}

/** Which optional columns the TSV output includes. */
export interface DiffsSummaryColumns {
  /** Order by replay diff then event index; adds the index/total columns. */
  orderByReplayDiffs: boolean;
  /** Add the domDiffIds column. */
  includeDomDiffIds: boolean;
  /**
   * Effective "all diffs" — true when --includeAllDiffs or --includeMatches is
   * set (see {@link resolveIncludeAllDiffs}); adds the isSelected column.
   */
  includeAllDiffs: boolean;
  /** Add the base/head replay ID columns. */
  includeReplayIds: boolean;
}

const fmtMismatch = (v: number | null): string =>
  v != null ? v.toFixed(5) : "";

/**
 * --includeMatches implies --includeAllDiffs: matches are never part of the
 * selected representative subset, so they only make sense alongside the full
 * set of diffs.
 */
export const resolveIncludeAllDiffs = ({
  includeAllDiffs,
  includeMatches,
}: {
  includeAllDiffs: boolean;
  includeMatches: boolean;
}): boolean => includeAllDiffs || includeMatches;

/**
 * Flattens replay diffs into one list of rows. By default the backend's `index`
 * is a flat cross-replay-diff priority rank, so we sort by it (a flat order the
 * grouped response can't express). With orderByReplayDiffs the backend already
 * returns rows grouped by replay diff in event order, which we preserve.
 */
export const flattenDiffRows = (
  data: DiffsSummaryReplayDiff[],
  orderByReplayDiffs: boolean,
): DiffRow[] => {
  const rows = data.flatMap((replayDiff) =>
    replayDiff.screenshots.map((screenshot) => ({ replayDiff, screenshot })),
  );
  if (!orderByReplayDiffs) {
    rows.sort((a, b) => a.screenshot.index - b.screenshot.index);
  }
  return rows;
};

/**
 * Builds the TSV header. index/total are only meaningful with orderByReplayDiffs;
 * by default rows are already in priority order, so the index is omitted.
 */
export const buildDiffsSummaryHeader = (
  columns: DiffsSummaryColumns,
): string[] => {
  const fields = ["replayDiffId", "screenshotName"];
  if (columns.orderByReplayDiffs) fields.push("index", "total");
  fields.push("outcome", "mismatch");
  if (columns.includeDomDiffIds) fields.push("domDiffIds");
  if (columns.includeAllDiffs) fields.push("isSelected");
  if (columns.includeReplayIds) fields.push("baseReplayId", "headReplayId");
  return fields;
};

/** Formats a single row's fields, gated by the same columns as the header. */
export const formatDiffRow = (
  { replayDiff, screenshot }: DiffRow,
  columns: DiffsSummaryColumns,
): (string | number)[] => {
  const fields: (string | number)[] = [
    replayDiff.replayDiffId,
    screenshot.screenshotName,
  ];
  if (columns.orderByReplayDiffs)
    fields.push(screenshot.index, screenshot.total ?? "");
  fields.push(screenshot.outcome, fmtMismatch(screenshot.mismatchFraction));
  if (columns.includeDomDiffIds) fields.push(screenshot.domDiffIds ?? "");
  if (columns.includeAllDiffs)
    fields.push(String(screenshot.isSelected ?? false));
  if (columns.includeReplayIds)
    fields.push(replayDiff.baseReplayId ?? "", replayDiff.headReplayId ?? "");
  return fields;
};
