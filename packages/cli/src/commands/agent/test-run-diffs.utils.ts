import type {
  DiffsSummaryCountsResponse,
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
  /** Add the domDiffIds column. */
  includeDomDiffIds: boolean;
  /** Return every diff, not just the selected subset; adds the isSelected column. */
  includeAllDiffs: boolean;
  /** Add the base/head replay ID columns. */
  includeReplayIds: boolean;
  /** Add the `decision` column (the PR review decision per diff). */
  includeReviewDecisions: boolean;
}

/** `key\tvalue` lines for the `--counts` output in the default (non-JSON) mode. */
export const formatDiffsSummaryCounts = (
  counts: DiffsSummaryCountsResponse,
): string[] => [
  `numReplays:\t${counts.numReplays}`,
  `numDiffs:\t${counts.numDiffs}`,
  `numApproved:\t${counts.numApproved}`,
  `numIgnored:\t${counts.numIgnored}`,
  `numRejected:\t${counts.numRejected}`,
  `numUnreviewed:\t${counts.numUnreviewed}`,
];

const fmtMismatch = (v: number | null): string =>
  v != null ? v.toFixed(5) : "";

/**
 * Flattens replay diffs into one list of rows, sorted by the backend's global
 * `index`. That index is a flat priority rank by default, or a replayDiff-grouped
 * rank under orderByReplayDiffs — either way sorting by it yields the intended
 * order (which the grouped response can't express positionally).
 */
export const flattenDiffRows = (data: DiffsSummaryReplayDiff[]): DiffRow[] => {
  const rows = data.flatMap((replayDiff) =>
    replayDiff.screenshots.map((screenshot) => ({ replayDiff, screenshot })),
  );
  rows.sort((a, b) => a.screenshot.index - b.screenshot.index);
  return rows;
};

/** Builds the TSV header. `index` is the global rank the rows are ordered by. */
export const buildDiffsSummaryHeader = (
  columns: DiffsSummaryColumns,
): string[] => {
  const fields = [
    "replayDiffId",
    "screenshotName",
    "index",
    "outcome",
    "mismatchFraction",
  ];
  if (columns.includeDomDiffIds) fields.push("domDiffIds");
  if (columns.includeAllDiffs) fields.push("isSelected");
  if (columns.includeReviewDecisions) fields.push("decision");
  if (columns.includeReplayIds) fields.push("baseReplayId", "headReplayId");
  return fields;
};

/**
 * Builds the JSON equivalent of the TSV: a flat array, one object per screenshot
 * in global `index` order (matching the MCP tool's shape). Optional fields are
 * omitted when absent rather than emitted as null; `orderByReplayDiffs` only
 * affects the `index` ordering, not the structure.
 */
export const buildDiffsSummaryJson = (
  data: DiffsSummaryReplayDiff[],
): unknown[] =>
  flattenDiffRows(data).map(({ replayDiff, screenshot }) => ({
    replayDiffId: replayDiff.replayDiffId,
    ...screenshotToJson(screenshot),
    ...(replayDiff.baseReplayId != null
      ? { baseReplayId: replayDiff.baseReplayId }
      : {}),
    ...(replayDiff.headReplayId != null
      ? { headReplayId: replayDiff.headReplayId }
      : {}),
  }));

const screenshotToJson = (
  screenshot: DiffsSummaryScreenshot,
): Record<string, unknown> => ({
  screenshotName: screenshot.screenshotName,
  index: screenshot.index,
  outcome: screenshot.outcome,
  ...(screenshot.mismatchFraction != null
    ? { mismatchFraction: screenshot.mismatchFraction }
    : {}),
  ...(screenshot.domDiffIds != null
    ? { domDiffIds: screenshot.domDiffIds }
    : {}),
  ...(screenshot.isSelected != null
    ? { isSelected: screenshot.isSelected }
    : {}),
  ...(screenshot.decision != null ? { decision: screenshot.decision } : {}),
});

/** Formats a single row's fields, gated by the same columns as the header. */
export const formatDiffRow = (
  { replayDiff, screenshot }: DiffRow,
  columns: DiffsSummaryColumns,
): (string | number)[] => {
  const fields: (string | number)[] = [
    replayDiff.replayDiffId,
    screenshot.screenshotName,
    screenshot.index,
  ];
  fields.push(screenshot.outcome, fmtMismatch(screenshot.mismatchFraction));
  if (columns.includeDomDiffIds) fields.push(screenshot.domDiffIds ?? "");
  if (columns.includeAllDiffs)
    fields.push(String(screenshot.isSelected ?? false));
  if (columns.includeReviewDecisions) fields.push(screenshot.decision ?? "");
  if (columns.includeReplayIds)
    fields.push(replayDiff.baseReplayId ?? "", replayDiff.headReplayId ?? "");
  return fields;
};
