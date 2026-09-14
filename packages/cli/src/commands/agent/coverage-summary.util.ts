import type { TestRunJsCoverageSummaryResponse } from "@alwaysmeticulous/client";

/**
 * The summary's `key:\tvalue` lines, in the response's own field order. Absent
 * optional fields produce no line at all, matching their omission from the
 * `--json` object rather than printing an empty or `n/a` cell.
 */
export const formatCoverageSummary = (
  summary: TestRunJsCoverageSummaryResponse,
): string[] => {
  const lines: string[] = [];
  const add = (
    key: string,
    value: string | number | null | undefined,
  ): void => {
    if (value == null) {
      return;
    }
    lines.push(`${key}:\t${value}`);
  };
  add("testRunId", summary.testRunId);
  add("commitSha", summary.commitSha);
  add("executionSha", summary.executionSha);
  add("files", summary.files);
  add("filesFailedToParse", summary.filesFailedToParse);
  add("executedLines", summary.executedLines);
  add("executableLines", summary.executableLines);
  add("uncoveredLines", summary.uncoveredLines);
  // The response carries the unrounded percentage (as the per-file
  // coveragePercentage column does); one decimal place is the readable form.
  add("coveragePercentage", formatPercentage(summary.coveragePercentage));
  add("coveragePercentageMax", formatPercentage(summary.coveragePercentageMax));
  return lines;
};

const formatPercentage = (
  value: number | null | undefined,
): string | undefined => (value == null ? undefined : value.toFixed(1));
