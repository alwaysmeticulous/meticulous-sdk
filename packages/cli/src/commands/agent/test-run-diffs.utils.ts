import type {
  DiffsSummaryDiff,
  DiffsSummaryCountsResponse,
} from "@alwaysmeticulous/client";

/** Which optional columns the TSV output includes. */
export interface DiffsSummaryColumns {
  /** Add the domDiffIds column. */
  includeDomDiffIds: boolean;
  /** Return every diff, not just the selected subset; adds the isSelected column. */
  includeAllDiffs: boolean;
  /** Add the base/head replay ID columns. */
  includeReplayIds: boolean;
  /** Add the mismatchFraction column. */
  includeMismatchFraction: boolean;
  /** Add the `decision` and `openComments` review columns. */
  includeReviews: boolean;
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

const fmtMismatch = (v: number | undefined): string =>
  v != null ? v.toFixed(5) : "";

/** Builds the TSV header in the same field order as the JSON objects. */
export const buildDiffsSummaryHeader = (
  columns: DiffsSummaryColumns,
): string[] => {
  const fields = ["replayDiffId", "screenshotName"];
  if (columns.includeMismatchFraction) fields.push("mismatchFraction");
  if (columns.includeDomDiffIds) fields.push("domDiffIds");
  if (columns.includeAllDiffs) fields.push("isSelected");
  if (columns.includeReviews) fields.push("decision", "openComments");
  if (columns.includeReplayIds) fields.push("baseReplayId", "headReplayId");
  return fields;
};

/** Formats a single row's fields, gated by the same columns as the header. */
export const formatDiffRow = (
  diff: DiffsSummaryDiff,
  columns: DiffsSummaryColumns,
): (string | number)[] => {
  const fields: (string | number)[] = [diff.replayDiffId, diff.screenshotName];
  if (columns.includeMismatchFraction)
    fields.push(fmtMismatch(diff.mismatchFraction));
  if (columns.includeDomDiffIds) fields.push(diff.domDiffIds ?? "");
  if (columns.includeAllDiffs) fields.push(String(diff.isSelected ?? false));
  if (columns.includeReviews)
    fields.push(diff.decision ?? "", diff.openComments ?? 0);
  if (columns.includeReplayIds)
    fields.push(diff.baseReplayId ?? "", diff.headReplayId ?? "");
  return fields;
};
