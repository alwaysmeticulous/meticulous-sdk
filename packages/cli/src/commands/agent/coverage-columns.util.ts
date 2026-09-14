import type {
  CompactRange,
  TestRunCoverageFile,
} from "@alwaysmeticulous/client";
import { shouldDefaultToExecutedRanges } from "@alwaysmeticulous/client";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";

// The per-file range/count/percentage columns, emitted (after `repoFilePath`)
// in this fixed order. Everything except `executedRanges` relies on
// executable-line data we only have for whole test runs.
export type CoverageColumn =
  | "executedRanges"
  | "executableRanges"
  | "uncoveredRanges"
  | "executedLines"
  | "executableLines"
  | "uncoveredLines"
  | "coveragePercentage";

// Single source of truth mapping each column to the request flag that asks for
// it, so the printed columns and the request payload can't drift apart. The
// three line-count columns share one flag — they are the same counts over the
// same lines, always wanted together, and splitting them would triple the flag
// surface without shrinking the payload.
export const COVERAGE_COLUMN_FLAG: Record<
  CoverageColumn,
  | "includeExecutedRanges"
  | "includeExecutableRanges"
  | "includeUncoveredRanges"
  | "includeLineCounts"
  | "includeCoveragePercentage"
> = {
  executedRanges: "includeExecutedRanges",
  executableRanges: "includeExecutableRanges",
  uncoveredRanges: "includeUncoveredRanges",
  executedLines: "includeLineCounts",
  executableLines: "includeLineCounts",
  uncoveredLines: "includeLineCounts",
  coveragePercentage: "includeCoveragePercentage",
};

// The column-selection flags exposed by js-coverage.
export interface CoverageColumnSelection {
  includeExecutedRanges: boolean;
  includeExecutableRanges: boolean;
  includeUncoveredRanges: boolean;
  includeLineCounts: boolean;
  includeCoveragePercentage: boolean;
}

// The columns (after `repoFilePath`) to request and print, in fixed order.
// Defaults to executed ranges when no column flag is given, so a bare
// invocation matches the historical output.
export const determineColumns = (
  selection: CoverageColumnSelection,
): CoverageColumn[] => {
  const includeExecuted = shouldDefaultToExecutedRanges(selection);
  const columns: CoverageColumn[] = [];
  if (includeExecuted) {
    columns.push("executedRanges");
  }
  if (selection.includeExecutableRanges) {
    columns.push("executableRanges");
  }
  if (selection.includeUncoveredRanges) {
    columns.push("uncoveredRanges");
  }
  if (selection.includeLineCounts) {
    columns.push("executedLines", "executableLines", "uncoveredLines");
  }
  if (selection.includeCoveragePercentage) {
    columns.push("coveragePercentage");
  }
  return columns;
};

// The JSON equivalent of a TSV row: `repoFilePath` plus the requested columns,
// with structured values (raw ranges / numeric percentage) rather than the
// TSV-formatted strings.
export const coverageFileToJson = (
  file: TestRunCoverageFile,
  columns: CoverageColumn[],
): Record<string, unknown> => {
  const row: Record<string, unknown> = { repoFilePath: file.repoFilePath };
  for (const column of columns) {
    row[column] = coverageColumnValue(file, column);
  }
  return row;
};

export const coverageColumnValue = (
  file: TestRunCoverageFile,
  column: CoverageColumn,
): CompactRange[] | number | null => {
  switch (column) {
    case "executedRanges":
      return file.executedRanges ?? [];
    case "executableRanges":
      return file.executableRanges ?? [];
    case "uncoveredRanges":
      return file.uncoveredRanges ?? [];
    case "executedLines":
      return file.executedLines ?? 0;
    case "executableLines":
      return file.executableLines ?? 0;
    case "uncoveredLines":
      return file.uncoveredLines ?? 0;
    case "coveragePercentage":
      return file.coveragePercentage ?? null;
    default:
      return assertNever(column);
  }
};

// Whether a column's numeric value is a line count rather than a percentage —
// counts print as integers, percentages to one decimal place.
const isLineCountColumn = (column: CoverageColumn): boolean =>
  column === "executedLines" ||
  column === "executableLines" ||
  column === "uncoveredLines";

// The TSV rendering of a column: the same structured value as the JSON output,
// formatted as a string (ranges joined, percentage to 1dp, absent percentage as
// "n/a"). Delegating to `coverageColumnValue` keeps a single switch over the
// column union.
export const formatCoverageColumn = (
  file: TestRunCoverageFile,
  column: CoverageColumn,
): string => {
  const value = coverageColumnValue(file, column);
  if (typeof value === "number") {
    return isLineCountColumn(column) ? String(value) : value.toFixed(1);
  }
  if (value == null) {
    return "n/a";
  }
  return formatCoverageRanges(value);
};

// Exhaustiveness guard for the CoverageColumn switch in `coverageColumnValue`.
// Local to this package since the public CLI can't depend on the internal
// common-utils helper.
const assertNever = (value: never): never => {
  throw new Error(`Unhandled coverage column: ${String(value)}`);
};
